/**
 * Sons do app, sintetizados na hora com WebAudio (sem arquivos de áudio no pacote).
 * Curtos e baixos de propósito: confirmam a ação sem competir com as vozes.
 *
 * Desenho: subir = ligar/chegar, descer = desligar/sair. Microfone usa notas médias,
 * fone usa notas mais graves, chamada usa três notas, transmissão um "blip" brilhante.
 */
export type SoundName =
  | 'mic-on'
  | 'mic-off'
  | 'deafen'
  | 'undeafen'
  | 'join'
  | 'leave'
  | 'user-join'
  | 'user-leave'
  | 'share-start'
  | 'share-stop'

interface Note {
  /** Frequência em Hz. */
  f: number
  /** Início, em segundos a partir do disparo. */
  at: number
  /** Duração em segundos. */
  len: number
  type?: OscillatorType
}

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const A4 = 440
const D5 = 587.33
const F4 = 349.23
const C4 = 261.63
const G4 = 392
const B5 = 987.77

const sounds: Record<SoundName, Note[]> = {
  'mic-on': [
    { f: G4, at: 0, len: 0.07 },
    { f: D5, at: 0.06, len: 0.1 },
  ],
  'mic-off': [
    { f: D5, at: 0, len: 0.07 },
    { f: G4, at: 0.06, len: 0.1 },
  ],
  deafen: [
    { f: A4, at: 0, len: 0.08, type: 'triangle' },
    { f: F4, at: 0.07, len: 0.08, type: 'triangle' },
    { f: C4, at: 0.14, len: 0.12, type: 'triangle' },
  ],
  undeafen: [
    { f: C4, at: 0, len: 0.08, type: 'triangle' },
    { f: F4, at: 0.07, len: 0.08, type: 'triangle' },
    { f: A4, at: 0.14, len: 0.12, type: 'triangle' },
  ],
  join: [
    { f: C5, at: 0, len: 0.12 },
    { f: E5, at: 0.09, len: 0.12 },
    { f: G5, at: 0.18, len: 0.22 },
  ],
  leave: [
    { f: G5, at: 0, len: 0.12 },
    { f: E5, at: 0.09, len: 0.12 },
    { f: C5, at: 0.18, len: 0.22 },
  ],
  'user-join': [
    { f: E5, at: 0, len: 0.09 },
    { f: G5, at: 0.08, len: 0.14 },
  ],
  'user-leave': [
    { f: G5, at: 0, len: 0.09 },
    { f: E5, at: 0.08, len: 0.14 },
  ],
  'share-start': [
    { f: G5, at: 0, len: 0.06, type: 'triangle' },
    { f: B5, at: 0.05, len: 0.12, type: 'triangle' },
  ],
  'share-stop': [
    { f: B5, at: 0, len: 0.06, type: 'triangle' },
    { f: G5, at: 0.05, len: 0.12, type: 'triangle' },
  ],
}

let context: AudioContext | null = null
let currentSink = ''

function ctx(): AudioContext {
  context ??= new AudioContext({ latencyHint: 'interactive' })
  return context
}

/** Os sons saem no mesmo dispositivo escolhido para as vozes. */
export function setSoundsOutput(deviceId: string): void {
  if (deviceId === currentSink) return
  currentSink = deviceId
  const c = ctx() as AudioContext & { setSinkId?: (id: string) => Promise<void> }
  void c.setSinkId?.(deviceId).catch(() => undefined)
}

export function playSound(name: SoundName, volume = 0.14): void {
  const c = ctx()
  if (c.state === 'suspended') void c.resume().catch(() => undefined)
  const start = c.currentTime + 0.01
  const out = c.createGain()
  out.gain.value = volume
  out.connect(c.destination)
  let end = start
  for (const note of sounds[name]) {
    const osc = c.createOscillator()
    const env = c.createGain()
    osc.type = note.type ?? 'sine'
    osc.frequency.value = note.f
    const t0 = start + note.at
    const t1 = t0 + note.len
    // Ataque rápido e cauda exponencial: soa como um "toque", sem estalo.
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(env).connect(out)
    osc.start(t0)
    osc.stop(t1 + 0.02)
    end = Math.max(end, t1)
  }
  setTimeout(() => out.disconnect(), (end - c.currentTime + 0.2) * 1000)
}
