import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut } from 'electron'
import type Koffi from 'koffi'
import { DEFAULT_BINDINGS, IpcChannel, isKeyBinding } from '@sharescreen/shared'
import type {
  BindingId,
  CallCommand,
  HotkeyInfo,
  KeyBinding,
  VoiceHotkeys,
} from '@sharescreen/shared'
import type { OverlayManager } from './overlay/overlay-manager'

const POLL_MS = 15
const BINDING_IDS: BindingId[] = ['mute', 'deafen', 'ptt', 'unlockMini']

type Stored = Omit<VoiceHotkeys, 'holdSupported'>

interface Actions {
  /** Manda um comando para a chamada (que vive no pill). */
  call(command: CallCommand): void
  /** Volta a deixar clicar na miniatura da transmissão (travada = clique atravessa). */
  unlockMini(): void
}

/**
 * Atalhos globais num lugar só (§2 item 16).
 *
 *  - Fixos (Electron `globalShortcut`): mostrar/esconder o overlay e modo fantasma.
 *  - Da pessoa (mutar, ensurdecer, push-to-talk, destravar miniatura): no Windows são lidos
 *    com GetAsyncKeyState a cada 15 ms. Assim a tecla continua chegando no jogo (o
 *    globalShortcut "rouba" a tecla) e dá para SEGURAR (push-to-talk) e usar os botões laterais
 *    do mouse. Fora do Windows, mutar/ensurdecer usam o globalShortcut e não há push-to-talk.
 *
 * [Hipótese] Jogos rodando como administrador: o Windows pode esconder o teclado de apps
 * comuns (UIPI). Se o push-to-talk não responder num jogo assim, abrir o Accord como admin.
 */
export class HotkeyService {
  private hotkeys: HotkeyInfo[] = []
  private settings: Stored
  private readonly file = join(app.getPath('userData'), 'hotkeys.json')
  private keyState: ((vk: number) => number) | null = null
  private timer: NodeJS.Timeout | null = null
  private pressed = new Set<BindingId>()
  private capturing = false
  private fallback: string[] = []
  private actions: Actions | null = null

  constructor(private readonly overlay: OverlayManager) {
    this.settings = this.load()
    if (process.platform === 'win32') {
      try {
        const koffi = createRequire(__filename)('koffi') as typeof Koffi
        const user32 = koffi.load('user32.dll')
        this.keyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)') as (
          vk: number,
        ) => number
      } catch (error) {
        console.error('[hotkeys] leitura do teclado indisponível', error)
      }
    }
  }

  registerAll(actions: Actions): void {
    this.actions = actions
    const definitions: Array<Omit<HotkeyInfo, 'registered'> & { run: () => void }> = [
      {
        id: 'toggle-overlay',
        accelerator: 'CommandOrControl+Shift+O',
        run: () => this.overlay.toggleVisible(),
      },
      {
        id: 'toggle-ghost',
        accelerator: 'CommandOrControl+Shift+G',
        run: () => this.overlay.toggleGhost(),
      },
    ]

    this.hotkeys = definitions.map(({ run, ...info }) => {
      const registered = globalShortcut.register(info.accelerator, run)
      if (!registered) console.warn(`[hotkeys] atalho em uso por outro app: ${info.accelerator}`)
      return { ...info, registered }
    })
    this.apply()
  }

  list(): HotkeyInfo[] {
    return this.hotkeys
  }

  voice(): VoiceHotkeys {
    return { ...this.settings, holdSupported: this.holdSupported() }
  }

  /** Testes fora do Windows: SHARESCREEN_FAKE_HOLD=1 deixa ligar o modo (o atalho vem por IPC). */
  private holdSupported(): boolean {
    return !!this.keyState || (!app.isPackaged && process.env.SHARESCREEN_FAKE_HOLD === '1')
  }

  setVoice(patch: Partial<Stored>): VoiceHotkeys {
    const next: Stored = {
      voiceMode:
        patch.voiceMode === 'ptt' || patch.voiceMode === 'voice'
          ? patch.voiceMode
          : this.settings.voiceMode,
      pttReleaseMs:
        typeof patch.pttReleaseMs === 'number' &&
        patch.pttReleaseMs >= 0 &&
        patch.pttReleaseMs <= 2000
          ? Math.round(patch.pttReleaseMs)
          : this.settings.pttReleaseMs,
      bindings: { ...this.settings.bindings },
    }
    if (patch.bindings) {
      for (const id of BINDING_IDS) {
        if (!(id in patch.bindings)) continue
        const value = patch.bindings[id]
        if (value === null || isKeyBinding(value)) next.bindings[id] = value
      }
    }
    // Push-to-talk sem atalho não faz sentido (o microfone nunca abriria).
    if (next.voiceMode === 'ptt' && (!next.bindings.ptt || !this.holdSupported())) {
      next.voiceMode = 'voice'
    }
    this.settings = next
    try {
      writeFileSync(this.file, JSON.stringify(next, null, 2))
    } catch (error) {
      console.warn('[hotkeys] não consegui salvar', error)
    }
    this.apply()
    const state = this.voice()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.VoiceHotkeysChanged, state)
    }
    return state
  }

  /** O painel está esperando a pessoa apertar a tecla do atalho novo. */
  setCapturing(active: boolean): void {
    this.capturing = active
    if (active) this.releaseAll()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    globalShortcut.unregisterAll()
  }

  private load(): Stored {
    const defaults: Stored = { voiceMode: 'voice', pttReleaseMs: 200, bindings: DEFAULT_BINDINGS }
    try {
      if (!existsSync(this.file)) return defaults
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Stored>
      const bindings = { ...defaults.bindings }
      for (const id of BINDING_IDS) {
        const value = saved.bindings?.[id]
        if (value === null || isKeyBinding(value)) bindings[id] = value
      }
      return {
        voiceMode: saved.voiceMode === 'ptt' ? 'ptt' : 'voice',
        pttReleaseMs:
          typeof saved.pttReleaseMs === 'number' ? saved.pttReleaseMs : defaults.pttReleaseMs,
        bindings,
      }
    } catch {
      return defaults
    }
  }

  private apply(): void {
    for (const accelerator of this.fallback) globalShortcut.unregister(accelerator)
    this.fallback = []
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.releaseAll()

    if (this.keyState) {
      const active = BINDING_IDS.filter((id) => this.settings.bindings[id])
      if (active.length) this.timer = setInterval(() => this.poll(), POLL_MS)
      return
    }
    // Fora do Windows: só os atalhos de apertar e soltar (sem push-to-talk).
    for (const id of ['mute', 'deafen', 'unlockMini'] as const) {
      const accelerator = this.settings.bindings[id]?.accelerator
      if (!accelerator) continue
      try {
        if (globalShortcut.register(accelerator, () => !this.capturing && this.fire(id, true))) {
          this.fallback.push(accelerator)
        }
      } catch {
        /* atalho inválido neste sistema */
      }
    }
  }

  private poll(): void {
    if (this.capturing || !this.keyState) return
    for (const id of BINDING_IDS) {
      const binding = this.settings.bindings[id]
      if (!binding) continue
      const down = this.isDown(binding)
      const was = this.pressed.has(id)
      if (down === was) continue
      if (down) this.pressed.add(id)
      else this.pressed.delete(id)
      this.fire(id, down)
    }
  }

  private isDown(binding: KeyBinding): boolean {
    const read = this.keyState!
    // Bit mais alto = a tecla está apertada agora.
    return binding.keys.every((vk) => (read(vk) & 0x8000) !== 0)
  }

  private releaseAll(): void {
    if (this.pressed.has('ptt')) this.fire('ptt', false)
    this.pressed.clear()
  }

  private fire(id: BindingId, down: boolean): void {
    const actions = this.actions
    if (!actions) return
    if (id === 'ptt') {
      if (this.settings.voiceMode === 'ptt') actions.call({ type: 'ptt', down })
      return
    }
    if (!down) return
    if (id === 'mute') actions.call({ type: 'toggle-mic' })
    if (id === 'deafen') actions.call({ type: 'toggle-deafen' })
    if (id === 'unlockMini') actions.unlockMini()
  }
}
