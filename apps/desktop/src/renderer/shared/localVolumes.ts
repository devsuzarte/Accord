/**
 * Volume de cada pessoa só para você (0 a 2 = 0% a 200%), guardado neste PC pelo nome
 * — como o "mutar para mim". Passar de 100% só é possível porque as vozes tocam pelo
 * WebAudio (webAudioMix do LiveKit), com um ganho por pessoa.
 */
const KEY = 'sharescreen.volumes'
export const MAX_VOLUME = 2

const keyOf = (name: string) => name.trim().toLowerCase()

export function readVolumes(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(saved)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(MAX_VOLUME, Math.max(0, v))
    }
    return out
  } catch {
    return {}
  }
}

export function volumeOf(volumes: Record<string, number>, name: string): number {
  return volumes[keyOf(name)] ?? 1
}

export function setVolume(name: string, volume: number): Record<string, number> {
  const volumes = readVolumes()
  const v = Math.min(MAX_VOLUME, Math.max(0, Math.round(volume * 100) / 100))
  if (v === 1) delete volumes[keyOf(name)]
  else volumes[keyOf(name)] = v
  try {
    localStorage.setItem(KEY, JSON.stringify(volumes))
  } catch {
    /* ignora */
  }
  return volumes
}
