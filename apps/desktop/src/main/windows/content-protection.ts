import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { AppCapabilities, CaptureProtection } from '@sharescreen/shared'
import { nativeAudioSupported } from '../share/native-audio'
import { windowsBuildAtLeast } from '../system'

/**
 * Janelas do Accord fora das capturas de tela (docs/16 P6), com uma chave só:
 *  - a escolha da pessoa ("esconder o Accord das capturas") vale para pill, painel, chat e
 *    lista de pessoas, inclusive para as janelas que abrirem depois;
 *  - algumas janelas ficam sempre fora (`always`): seletor, marcadores e quem assiste, para a
 *    transmissão não mostrar a si mesma.
 */

const FILE = 'capture.json'
const tracked = new Map<BrowserWindow, { always: boolean }>()
let state: CaptureProtection | null = null

function load(): CaptureProtection {
  if (state) return state
  try {
    const saved = JSON.parse(readFileSync(join(app.getPath('userData'), FILE), 'utf8')) as {
      hideFromCaptures?: unknown
    }
    state = { hideFromCaptures: saved.hideFromCaptures !== false }
  } catch {
    state = { hideFromCaptures: true }
  }
  return state
}

function apply(win: BrowserWindow, always: boolean): void {
  if (!win.isDestroyed()) win.setContentProtection(always || load().hideFromCaptures)
}

/** Registra a janela e aplica a proteção já na criação. */
export function protectWindow(win: BrowserWindow, options: { always?: boolean } = {}): void {
  const always = options.always === true
  tracked.set(win, { always })
  win.once('closed', () => tracked.delete(win))
  apply(win, always)
}

export function getCaptureProtection(): CaptureProtection {
  return { ...load() }
}

export function setCaptureProtection(value: CaptureProtection): void {
  state = { hideFromCaptures: value.hideFromCaptures }
  try {
    writeFileSync(join(app.getPath('userData'), FILE), JSON.stringify(state))
  } catch (error) {
    console.error('[captura] não consegui salvar a escolha', error)
  }
  for (const [win, { always }] of tracked) apply(win, always)
  console.info(`[captura] esconder o Accord das capturas: ${state.hideFromCaptures}`)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannel.CaptureProtectionChanged, state)
  }
}

export function appCapabilities(): AppCapabilities {
  return {
    shareAudio: nativeAudioSupported(),
    captureExclusion: process.platform === 'darwin' || windowsBuildAtLeast(19041),
    hardwareAcceleration: app.isHardwareAccelerationEnabled(),
  }
}
