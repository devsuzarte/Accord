import { DEFAULT_THEME } from '@sharescreen/shared'
import type { Theme } from '@sharescreen/shared'

/** Luminância relativa (0 = preto, 1 = branco) de uma cor #rrggbb. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  )
}

const mix = (a: string, b: string, amountOfA: number) =>
  `color-mix(in srgb, ${a} ${Math.round(amountOfA * 100)}%, ${b})`

/**
 * Aplica o tema: as 8 cores editáveis viram os tokens do design system
 * (packages/ui/src/styles/tokens.css); hover, bordas e lombada são derivados delas.
 */
export function applyTheme(theme: Theme): void {
  const c = theme.colors
  const light = luminance(c.background) > 0.5
  const ink = light ? '#000' : '#fff'
  const shade = '#000'
  const vars: Record<string, string> = {
    '--bg-tertiary': c.background,
    '--bg-secondary': c.surface,
    '--bg-primary': mix(c.surface, ink, 0.94),
    '--bg-floating': mix(c.background, shade, light ? 0.92 : 0.6),
    '--bg-modifier-hover': mix(c.textMuted, 'transparent', 0.22),
    '--bg-modifier-selected': mix(c.textMuted, 'transparent', 0.42),
    '--text-normal': c.text,
    '--text-strong': mix(c.text, ink, 0.6),
    '--text-muted': c.textMuted,
    '--interactive': mix(c.text, c.textMuted, 0.5),
    '--interactive-hover': c.text,
    '--brand': c.accent,
    '--brand-hover': mix(c.accent, shade, 0.82),
    '--status-green': c.speaking,
    '--status-yellow': c.warning,
    '--status-red': c.danger,
    '--material': mix(c.background, 'transparent', 0.94),
    '--material-raised': mix(ink, 'transparent', light ? 0.05 : 0.04),
    '--material-raised-hover': mix(ink, 'transparent', light ? 0.09 : 0.08),
    '--material-border': mix(ink, 'transparent', light ? 0.12 : 0.09),
    '--spine': mix(c.background, shade, light ? 0.9 : 0.78),
    '--app-bg-image': theme.backgroundImage ? `url("${theme.backgroundImage}")` : 'none',
    '--app-bg-opacity': String(theme.backgroundImage ? theme.backgroundOpacity : 0),
  }
  const root = document.documentElement
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  root.dataset.scheme = light ? 'light' : 'dark'
  root.style.colorScheme = light ? 'light' : 'dark'
}

/** Carrega o tema salvo e acompanha mudanças feitas na aba Aparência. */
export function startTheme(): () => void {
  applyTheme(DEFAULT_THEME)
  window.platform.theme.get().then(applyTheme).catch(console.error)
  return window.platform.theme.onChange(applyTheme)
}
