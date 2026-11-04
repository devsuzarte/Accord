import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
// Arquivos servidos ao lado da página (a CSP não aceita worklet/wasm embutidos em data:).
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url&no-inline'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url&no-inline'
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url&no-inline'
import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client'

/**
 * Supressão de ruído com RNNoise (rede neural pequena da Xiph, licença BSD) rodando em
 * WebAssembly num AudioWorklet — tira teclado, ventilador e barulho de fundo da sua voz.
 * Comparativo e motivos: docs/11-pesquisa-ruido-e-discord.md.
 *
 * O RNNoise trabalha a 48 kHz: o microfone passa por um AudioContext nosso nessa taxa.
 */
let context: AudioContext | null = null
let ready: Promise<ArrayBuffer> | null = null

export function noiseContext(): AudioContext {
  if (!context || context.state === 'closed') {
    context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    ready = null
  }
  return context
}

/** Carrega o wasm e registra o worklet uma vez por AudioContext. */
function prepare(ctx: AudioContext): Promise<ArrayBuffer> {
  ready ??= Promise.all([
    loadRnnoise({ url: wasmUrl, simdUrl }),
    ctx.audioWorklet.addModule(workletUrl),
  ]).then(([binary]) => binary)
  return ready
}

export class RnnoiseProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'rnnoise'
  processedTrack?: MediaStreamTrack
  private source: MediaStreamAudioSourceNode | null = null
  private node: RnnoiseWorkletNode | null = null
  private destination: MediaStreamAudioDestinationNode | null = null

  async init({ track, audioContext }: AudioProcessorOptions): Promise<void> {
    const wasmBinary = await prepare(audioContext)
    if (audioContext.state === 'suspended') await audioContext.resume().catch(() => undefined)
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]))
    this.node = new RnnoiseWorkletNode(audioContext, { maxChannels: 1, wasmBinary })
    this.destination = audioContext.createMediaStreamDestination()
    this.destination.channelCount = 1
    this.source.connect(this.node).connect(this.destination)
    this.processedTrack = this.destination.stream.getAudioTracks()[0]
  }

  /** Trocou o microfone: refaz a cadeia com a faixa nova. */
  async restart(options: AudioProcessorOptions): Promise<void> {
    await this.destroy()
    await this.init(options)
  }

  async destroy(): Promise<void> {
    this.source?.disconnect()
    this.node?.disconnect()
    this.node?.destroy()
    this.processedTrack?.stop()
    this.source = null
    this.node = null
    this.destination = null
    this.processedTrack = undefined
  }
}
