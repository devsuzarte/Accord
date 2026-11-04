/**
 * "Mutar para mim": guardado neste computador pelo NOME da pessoa (a identidade da chamada
 * muda a cada entrada). O pill aplica nas vozes; o viewer, no som da transmissão.
 * Todas as janelas do app são da mesma origem, então o evento `storage` avisa as outras.
 */
export interface LocalMutes {
  mic: string[]
  audio: string[]
}

const KEY = 'sharescreen.mutes'

export const muteKey = (name: string) => name.trim().toLowerCase()

export function readLocalMutes(): LocalMutes {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LocalMutes> | null
    return {
      mic: Array.isArray(saved?.mic) ? saved.mic : [],
      audio: Array.isArray(saved?.audio) ? saved.audio : [],
    }
  } catch {
    return { mic: [], audio: [] }
  }
}

export function isLocallyMuted(mutes: LocalMutes, kind: keyof LocalMutes, name: string): boolean {
  return mutes[kind].includes(muteKey(name))
}

export function setLocalMute(kind: keyof LocalMutes, name: string, muted: boolean): LocalMutes {
  const mutes = readLocalMutes()
  const key = muteKey(name)
  const rest = mutes[kind].filter((n) => n !== key)
  const next = { ...mutes, [kind]: muted ? [...rest, key] : rest }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignora */
  }
  return next
}

/** Avisa quando outra janela mudou os silêncios. */
export function onLocalMutesChange(listener: (mutes: LocalMutes) => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === KEY) listener(readLocalMutes())
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
