import { en } from './en'
import { ptBR } from './pt-BR'

/**
 * Idiomas do app. O português é a fonte: toda chave nasce em pt-BR.ts e o TypeScript
 * obriga o en.ts a ter a mesma chave (falta = erro de compilação).
 */
export type Locale = 'pt-BR' | 'en'
/** O que a pessoa escolheu: um idioma ou "seguir o sistema". */
export type LanguageSetting = Locale | 'system'

export type MessageKey = keyof typeof ptBR
export type Messages = Record<MessageKey, string>
export type MessageParams = Record<string, string | number>

export interface LanguageState {
  setting: LanguageSetting
  locale: Locale
}

const dictionaries: Record<Locale, Messages> = { 'pt-BR': ptBR, en }

export const LOCALE_NAMES: Record<Locale, string> = { 'pt-BR': 'Português (Brasil)', en: 'English' }

/** "pt", "pt-PT", "pt-BR" → português; qualquer outro → inglês. */
export function resolveLocale(setting: LanguageSetting, systemLocale: string): Locale {
  if (setting !== 'system') return setting
  return systemLocale.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

/** Texto da chave no idioma, com `{nome}` trocado pelos parâmetros. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const text = dictionaries[locale][key] ?? ptBR[key] ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  )
}

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === 'system' || value === 'pt-BR' || value === 'en'
}
