import { translate } from '@sharescreen/shared'
import type { Locale, MessageKey, MessageParams } from '@sharescreen/shared'

/** Idioma dos textos que o main mostra (bandeja, notificações, nomes de tela, títulos). */
let locale: Locale = 'pt-BR'

export function setMainLocale(next: Locale): void {
  locale = next
}

export function tm(key: MessageKey, params?: MessageParams): string {
  return translate(locale, key, params)
}
