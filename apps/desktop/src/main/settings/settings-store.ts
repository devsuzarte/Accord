import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import {
  DEFAULT_SOUND_SETTINGS,
  DEFAULT_THEME,
  SOUND_MAX_BYTES,
  SOUND_NAMES,
  isLanguageSetting,
  MAX_BACKGROUND_OPACITY,
  MAX_IMAGE_BYTES,
  resolveLocale,
} from '@sharescreen/shared'
import type {
  GifSettings,
  LanguageSetting,
  LanguageState,
  Profile,
  SoundName,
  SoundSettings,
  Theme,
  ThemeColors,
} from '@sharescreen/shared'
import { setMainLocale } from '../i18n'
import { IpcChannel } from '@sharescreen/shared'

/**
 * Perfil (nome e foto), aparência (cores, fundo) e idioma — um arquivo JSON cada, na pasta
 * de dados do app. Toda mudança é enviada a todas as janelas abertas.
 */

function file(name: string): string {
  return join(app.getPath('userData'), name)
}

function load<T>(name: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(readFileSync(file(name), 'utf8')) as Partial<T>) }
  } catch {
    return fallback
  }
}

function save(name: string, value: unknown): void {
  try {
    writeFileSync(file(name), JSON.stringify(value))
  } catch (error) {
    console.warn(`[ajustes] não consegui salvar ${name}`, error)
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Data URL de imagem dentro do limite (aceita GIF). */
function validImage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(value)) return null
  // base64 ≈ 4/3 do tamanho real
  if (value.length > MAX_IMAGE_BYTES * 1.4) return null
  return value
}

const hex = /^#[0-9a-f]{6}$/i

export class SettingsStore {
  private profile: Profile = load<Profile>('profile.json', { name: '', avatar: null })
  private theme: Theme = load<Theme>('theme.json', DEFAULT_THEME)
  private language: LanguageSetting = (() => {
    const saved = load<{ language: unknown }>('settings.json', { language: 'system' }).language
    return isLanguageSetting(saved) ? saved : 'system'
  })()
  private sounds: SoundSettings = cleanSounds(load<unknown>('sounds.json', DEFAULT_SOUND_SETTINGS))
  /** Chave da busca de GIFs (só de quem hospeda; vai para o servidor aberto por este app). */
  private gifs: GifSettings | null = cleanGifs(load<unknown>('gifs.json', {}))
  /** Avisado quando o idioma muda (a bandeja se refaz). */
  onLanguageChange: (() => void) | null = null
  /** Avisado quando as cores mudam (a barra da janela de chat acompanha). */
  onThemeChange: ((theme: Theme) => void) | null = null

  constructor() {
    setMainLocale(this.getLanguage().locale)
  }

  getLanguage(): LanguageState {
    return { setting: this.language, locale: resolveLocale(this.language, app.getLocale()) }
  }

  setLanguage(input: unknown): void {
    if (!isLanguageSetting(input)) return
    this.language = input
    save('settings.json', { language: input })
    const state = this.getLanguage()
    setMainLocale(state.locale)
    broadcast(IpcChannel.LanguageChanged, state)
    this.onLanguageChange?.()
  }

  getProfile(): Profile {
    return this.profile
  }

  setProfile(input: unknown): void {
    const p = input as Partial<Profile>
    if (typeof p !== 'object' || p === null) return
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 32) : this.profile.name
    const avatar = p.avatar === null ? null : (validImage(p.avatar) ?? this.profile.avatar)
    this.profile = { name, avatar }
    save('profile.json', this.profile)
    broadcast(IpcChannel.ProfileChanged, this.profile)
  }

  getTheme(): Theme {
    return this.theme
  }

  setTheme(input: unknown): void {
    const t = input as Partial<Theme>
    if (typeof t !== 'object' || t === null) return
    const colors = { ...this.theme.colors }
    for (const key of Object.keys(DEFAULT_THEME.colors) as Array<keyof ThemeColors>) {
      const value = t.colors?.[key]
      if (typeof value === 'string' && hex.test(value)) colors[key] = value
    }
    const opacity = Number(t.backgroundOpacity)
    this.theme = {
      preset: typeof t.preset === 'string' ? t.preset.slice(0, 32) : this.theme.preset,
      colors,
      backgroundImage:
        t.backgroundImage === null
          ? null
          : (validImage(t.backgroundImage) ?? this.theme.backgroundImage),
      backgroundOpacity: Number.isFinite(opacity)
        ? Math.min(MAX_BACKGROUND_OPACITY, Math.max(0, opacity))
        : this.theme.backgroundOpacity,
    }
    save('theme.json', this.theme)
    broadcast(IpcChannel.ThemeChanged, this.theme)
    this.onThemeChange?.(this.theme)
  }

  getSounds(): SoundSettings {
    return this.sounds
  }

  setSounds(input: unknown): void {
    this.sounds = cleanSounds(input, this.sounds)
    save('sounds.json', this.sounds)
    broadcast(IpcChannel.SoundsChanged, this.sounds)
  }

  getGifs(): GifSettings | null {
    return this.gifs
  }

  setGifs(input: unknown): GifSettings | null {
    this.gifs = input === null ? null : cleanGifs(input)
    save('gifs.json', this.gifs ?? {})
    return this.gifs
  }
}

const packs = ['accord', 'soft', 'arcade']

/** Confere tudo o que vem do painel (e do arquivo, que alguém pode ter editado). */
function cleanSounds(input: unknown, base: SoundSettings = DEFAULT_SOUND_SETTINGS): SoundSettings {
  const v = (typeof input === 'object' && input !== null ? input : {}) as Partial<SoundSettings>
  const names = SOUND_NAMES as readonly string[]
  const volume = Number(v.volume)
  const custom: Partial<Record<SoundName, string>> = {}
  const source = typeof v.custom === 'object' && v.custom !== null ? v.custom : base.custom
  for (const [name, data] of Object.entries(source)) {
    if (
      names.includes(name) &&
      typeof data === 'string' &&
      /^data:audio\/(mpeg|mp3|ogg|wav|x-wav|wave|webm|aac|mp4|x-m4a|flac);base64,/.test(data) &&
      data.length <= SOUND_MAX_BYTES * 1.4
    ) {
      custom[name as SoundName] = data
    }
  }
  return {
    pack: packs.includes(v.pack as string) ? (v.pack as SoundSettings['pack']) : base.pack,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : base.volume,
    muted: Array.isArray(v.muted)
      ? (v.muted.filter((n) => names.includes(n as string)) as SoundName[])
      : base.muted,
    custom,
  }
}

function cleanGifs(input: unknown): GifSettings | null {
  const v = input as Partial<GifSettings> | null
  if (!v || (v.provider !== 'klipy' && v.provider !== 'giphy')) return null
  const key = typeof v.key === 'string' ? v.key.trim().slice(0, 200) : ''
  return key && /^[\w.-]+$/.test(key) ? { provider: v.provider, key } : null
}
