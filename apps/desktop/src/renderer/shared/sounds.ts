import { DEFAULT_SOUND_SETTINGS } from '@sharescreen/shared'
import type { SoundName, SoundPack, SoundSettings } from '@sharescreen/shared'

/**
 * Sons do app, sintetizados na hora com WebAudio (nenhum arquivo de terceiros no pacote; nada
 * dos sons do Discord). Curtos e baixos de propósito: confirmam a ação sem competir com as
 * vozes. Cada ação pode ser silenciada ou trocada por um som próprio (aba Você → Sons).
 *
 * Desenho: subir = ligar/chegar, descer = desligar/sair. Microfone usa notas médias, fone notas
 * graves, chamada três notas, transmissão um brilho, música um dedilhado, erro um tom grave.
 * O pacote muda o timbre: `accord` (padrão), `soft` (sinos suaves) e `arcade` (8 bits).
 */

interface Note {
  /** Frequência em Hz. */
  f: number
  /** Início, em segundos a partir do disparo. */
  at: number
  /** Duração em segundos. */
  len: number
  type?: OscillatorType
  /** Termina nesta frequência (deslizando). */
  to?: number
  /** Volume desta nota (1 = normal). */
  gain?: number
}

const C4 = 261.63
const D4 = 293.66
const F4 = 349.23
const G4 = 392
const A4 = 440
const C5 = 523.25
const D5 = 587.33
const E5 = 659.25
const G5 = 783.99
const A5 = 880
const B5 = 987.77
const C6 = 1046.5
const D6 = 1174.66
const E6 = 1318.51

const recipes: Record<SoundName, Note[]> = {
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
  // Outra pessoa começou/parou de transmitir: um brilho de três notas (a sua é de duas).
  'stream-on': [
    { f: G5, at: 0, len: 0.05, type: 'triangle', gain: 0.8 },
    { f: B5, at: 0.045, len: 0.05, type: 'triangle', gain: 0.8 },
    { f: D6, at: 0.09, len: 0.16, type: 'triangle' },
  ],
  'stream-off': [
    { f: D6, at: 0, len: 0.05, type: 'triangle', gain: 0.8 },
    { f: B5, at: 0.045, len: 0.05, type: 'triangle', gain: 0.8 },
    { f: G5, at: 0.09, len: 0.16, type: 'triangle' },
  ],
  message: [
    { f: A5, at: 0, len: 0.05 },
    { f: D6, at: 0.045, len: 0.08 },
  ],
  'message-sent': [{ f: 700, to: 1150, at: 0, len: 0.07, gain: 0.7 }],
  mention: [
    { f: A5, at: 0, len: 0.06 },
    { f: E6, at: 0.06, len: 0.06 },
    { f: A5, at: 0.12, len: 0.06 },
    { f: E6, at: 0.18, len: 0.14 },
  ],
  reaction: [{ f: E6, to: B5, at: 0, len: 0.045, gain: 0.7 }],
  'music-queued': [
    { f: C6, at: 0, len: 0.06, type: 'triangle', gain: 0.8 },
    { f: E6, at: 0.06, len: 0.1, type: 'triangle', gain: 0.8 },
  ],
  'music-next': [
    { f: E5, at: 0, len: 0.07, type: 'triangle', gain: 0.6 },
    { f: G5, at: 0.06, len: 0.07, type: 'triangle', gain: 0.6 },
    { f: C6, at: 0.12, len: 0.16, type: 'triangle', gain: 0.7 },
  ],
  'ptt-down': [{ f: 1500, at: 0, len: 0.025, gain: 0.5 }],
  'ptt-up': [{ f: 1100, at: 0, len: 0.025, gain: 0.5 }],
  reconnecting: [
    { f: D4, at: 0, len: 0.1, type: 'triangle' },
    { f: D4, at: 0.16, len: 0.1, type: 'triangle' },
  ],
  reconnected: [
    { f: D4, at: 0, len: 0.08, type: 'triangle' },
    { f: A4, at: 0.08, len: 0.16, type: 'triangle' },
  ],
  error: [
    { f: A4, to: F4, at: 0, len: 0.12, type: 'triangle' },
    { f: F4, to: D4, at: 0.1, len: 0.18, type: 'triangle' },
  ],
}

/** Como cada pacote toca a mesma receita. */
const timbres: Record<
  SoundPack,
  { type?: OscillatorType; release: number; level: number; cutoff: number; shimmer: number }
> = {
  // Seno com um pouco da oitava de cima: claro, mas sem estalo.
  accord: { release: 1, level: 1, cutoff: 6000, shimmer: 0.12 },
  // Sinos: cauda mais longa, mais grave e mais baixo.
  soft: { type: 'sine', release: 1.7, level: 0.8, cutoff: 2600, shimmer: 0.05 },
  // 8 bits: onda quadrada curta.
  arcade: { type: 'square', release: 0.75, level: 0.45, cutoff: 9000, shimmer: 0 },
}

let context: AudioContext | null = null
let currentSink = ''
let settings: SoundSettings = DEFAULT_SOUND_SETTINGS
const decoded = new Map<string, Promise<AudioBuffer | null>>()

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

export function setSoundSettings(next: SoundSettings): void {
  settings = next
}

/** Lê os ajustes salvos e acompanha as mudanças feitas no painel. */
export function followSoundSettings(): () => void {
  window.platform.sounds
    .get()
    .then(setSoundSettings)
    .catch(() => undefined)
  return window.platform.sounds.onChange(setSoundSettings)
}

function decode(data: string): Promise<AudioBuffer | null> {
  let pending = decoded.get(data)
  if (!pending) {
    pending = fetch(data)
      .then((r) => r.arrayBuffer())
      .then((bytes) => ctx().decodeAudioData(bytes))
      .catch(() => null)
    decoded.set(data, pending)
    if (decoded.size > 30) decoded.delete(decoded.keys().next().value!)
  }
  return pending
}

/**
 * Toca um som do app. `gain` é o volume base da ação (0.14 = normal); o volume escolhido
 * pela pessoa multiplica por cima.
 */
export function playSound(name: SoundName, gain = 0.14, use: SoundSettings = settings): void {
  if (use.muted.includes(name) || use.volume <= 0) return
  const c = ctx()
  if (c.state === 'suspended') void c.resume().catch(() => undefined)
  const level = gain * use.volume * 1.4
  const custom = use.custom[name]
  if (custom) {
    void decode(custom).then((buffer) => {
      if (!buffer) return synth(c, name, level, use.pack)
      const source = c.createBufferSource()
      const out = c.createGain()
      // Som próprio: no máximo 4 s e um pouco mais alto (arquivos costumam vir baixos).
      out.gain.value = Math.min(1, level * 3)
      source.buffer = buffer
      source.connect(out).connect(c.destination)
      source.start()
      source.stop(c.currentTime + Math.min(4, buffer.duration))
      source.onended = () => out.disconnect()
    })
    return
  }
  synth(c, name, level, use.pack)
}

function synth(c: AudioContext, name: SoundName, level: number, pack: SoundPack): void {
  const timbre = timbres[pack]
  const start = c.currentTime + 0.01
  const out = c.createGain()
  out.gain.value = level * timbre.level
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = timbre.cutoff
  out.connect(filter).connect(c.destination)
  let end = start
  for (const note of recipes[name]) {
    const t0 = start + note.at
    const t1 = t0 + note.len * timbre.release
    const voices: Array<{ mult: number; gain: number }> = [{ mult: 1, gain: 1 }]
    if (timbre.shimmer > 0) voices.push({ mult: 2, gain: timbre.shimmer })
    for (const voice of voices) {
      const osc = c.createOscillator()
      const env = c.createGain()
      osc.type = timbre.type ?? note.type ?? 'sine'
      osc.frequency.setValueAtTime(note.f * voice.mult, t0)
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to * voice.mult, t1)
      // Ataque rápido e cauda exponencial: soa como um "toque", sem estalo.
      const peak = Math.max(0.0002, (note.gain ?? 1) * voice.gain)
      env.gain.setValueAtTime(0.0001, t0)
      env.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
      env.gain.exponentialRampToValueAtTime(0.0001, t1)
      osc.connect(env).connect(out)
      osc.start(t0)
      osc.stop(t1 + 0.02)
    }
    end = Math.max(end, t1)
  }
  setTimeout(() => out.disconnect(), (end - c.currentTime + 0.3) * 1000)
}
