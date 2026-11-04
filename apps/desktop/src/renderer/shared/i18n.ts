import { resolveLocale, translate } from '@sharescreen/shared'
import type { LanguageState, MessageKey, MessageParams } from '@sharescreen/shared'
import { useSyncExternalStore } from 'react'

/**
 * Idioma nas janelas. O main guarda a escolha e avisa todas as janelas quando muda.
 * `t()` funciona fora do React (ex.: mensagens de erro da chamada); `useT()` re-renderiza.
 */
let state: LanguageState = {
  setting: 'system',
  locale: resolveLocale('system', navigator.language),
}
const listeners = new Set<() => void>()

function apply(next: LanguageState): void {
  state = next
  document.documentElement.lang = next.locale
  listeners.forEach((listener) => listener())
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translate(state.locale, key, params)
}

/** Carrega o idioma salvo (antes do primeiro render) e acompanha as mudanças. */
export async function startLanguage(): Promise<void> {
  window.platform.language.onChange(apply)
  try {
    apply(await window.platform.language.get())
  } catch (error) {
    console.error(error)
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLanguage(): LanguageState {
  return useSyncExternalStore(subscribe, () => state)
}

/** Use nos componentes: o texto troca na hora quando o idioma muda. */
export function useT(): typeof t {
  useLanguage()
  return t
}

/** Nome do canal: o canal padrão ("geral") aparece traduzido. */
export function channelLabel(id: string, name: string): string {
  return id === 'geral' ? t('channel.general') : name
}
