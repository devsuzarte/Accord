import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import {
  DEFAULT_THEME,
  isLanguageSetting,
  MAX_BACKGROUND_OPACITY,
  MAX_IMAGE_BYTES,
  resolveLocale,
} from '@sharescreen/shared'
import type {
  LanguageSetting,
  LanguageState,
  Profile,
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
  /** Avisado quando o idioma muda (a bandeja se refaz). */
  onLanguageChange: (() => void) | null = null

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
  }
}
