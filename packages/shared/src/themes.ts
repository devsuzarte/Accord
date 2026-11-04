import type { Theme, ThemeColors } from './types'

/** Paletas prontas. A primeira é o padrão (estilo Discord escuro). */
export const THEME_PRESETS: Array<{ id: string; name: string; colors: ThemeColors }> = [
  {
    id: 'grafite',
    name: 'Grafite',
    colors: {
      background: '#1e1f22',
      surface: '#2b2d31',
      accent: '#5865f2',
      text: '#dbdee1',
      textMuted: '#949ba4',
      speaking: '#23a55a',
      danger: '#f23f43',
      warning: '#f0b232',
    },
  },
  {
    id: 'meia-noite',
    name: 'Meia-noite',
    colors: {
      background: '#0f1424',
      surface: '#1a2138',
      accent: '#4f8cff',
      text: '#dce4f5',
      textMuted: '#8b97b3',
      speaking: '#2fd47c',
      danger: '#ff5468',
      warning: '#ffc14d',
    },
  },
  {
    id: 'floresta',
    name: 'Floresta',
    colors: {
      background: '#141c17',
      surface: '#1f2a23',
      accent: '#3fb57a',
      text: '#dbe7df',
      textMuted: '#8fa597',
      speaking: '#7be0a0',
      danger: '#f2565a',
      warning: '#e9c46a',
    },
  },
  {
    id: 'ameixa',
    name: 'Ameixa',
    colors: {
      background: '#1b1424',
      surface: '#291f36',
      accent: '#b46cf0',
      text: '#e8def5',
      textMuted: '#a191b5',
      speaking: '#3ddc97',
      danger: '#ff5c7a',
      warning: '#ffbf5a',
    },
  },
  {
    id: 'brasa',
    name: 'Brasa',
    colors: {
      background: '#1d1614',
      surface: '#2c211d',
      accent: '#f07a3e',
      text: '#f2e3da',
      textMuted: '#ad978b',
      speaking: '#4ccf7e',
      danger: '#ff4d4d',
      warning: '#ffc857',
    },
  },
  {
    id: 'claro',
    name: 'Claro',
    colors: {
      background: '#f2f3f5',
      surface: '#ffffff',
      accent: '#5865f2',
      text: '#2e3338',
      textMuted: '#5c6370',
      speaking: '#1f9d55',
      danger: '#d83c3e',
      warning: '#b7791f',
    },
  },
]

export const DEFAULT_THEME: Theme = {
  preset: THEME_PRESETS[0]!.id,
  colors: THEME_PRESETS[0]!.colors,
  backgroundImage: null,
  backgroundOpacity: 0.18,
}

/** Ordem das cores na aba Aparência (os nomes vêm do i18n: `color.<chave>`). */
export const THEME_COLOR_KEYS: Array<keyof ThemeColors> = [
  'background',
  'surface',
  'accent',
  'text',
  'textMuted',
  'speaking',
  'danger',
  'warning',
]

export const MAX_BACKGROUND_OPACITY = 0.6
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
