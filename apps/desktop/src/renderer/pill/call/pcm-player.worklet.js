/* global AudioWorkletProcessor, registerProcessor -- globais do escopo de AudioWorklet */
/**
 * AudioWorklet: recebe PCM s16le estéreo 48 kHz (da captura nativa do Windows) e toca
 * no grafo de áudio, que vira uma MediaStreamTrack publicada como "som da transmissão".
 *
 * Buffer circular de 1 s com teto de latência: se acumular mais que ~150 ms (ex.: a aba
 * travou), descarta o mais antigo para o som não ficar atrasado em relação ao vídeo.
 */
const CAPACITY = 48000
const MAX_BUFFERED = Math.round(48000 * 0.15)

class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super()
    this.left = new Float32Array(CAPACITY)
    this.right = new Float32Array(CAPACITY)
    this.readIndex = 0
    this.writeIndex = 0
    this.size = 0
    this.port.onmessage = (event) => this.push(event.data)
  }

  push(data) {
    let bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    if (!(bytes instanceof Uint8Array)) return
    // Int16Array exige deslocamento par.
    if (bytes.byteOffset % 2 !== 0) bytes = bytes.slice()
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1)

    for (let i = 0; i + 1 < samples.length; i += 2) {
      if (this.size === CAPACITY) this.drop(1)
      this.left[this.writeIndex] = samples[i] / 32768
      this.right[this.writeIndex] = samples[i + 1] / 32768
      this.writeIndex = (this.writeIndex + 1) % CAPACITY
      this.size++
    }
    if (this.size > MAX_BUFFERED) this.drop(this.size - MAX_BUFFERED)
  }

  drop(frames) {
    this.readIndex = (this.readIndex + frames) % CAPACITY
    this.size -= frames
  }

  process(_inputs, outputs) {
    const output = outputs[0]
    const left = output[0]
    const right = output[1] ?? output[0]
    for (let i = 0; i < left.length; i++) {
      if (this.size > 0) {
        left[i] = this.left[this.readIndex]
        right[i] = this.right[this.readIndex]
        this.readIndex = (this.readIndex + 1) % CAPACITY
        this.size--
      } else {
        left[i] = 0
        right[i] = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-player', PcmPlayer)
