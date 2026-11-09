import { SHARE_AUDIO_PORT_MESSAGE, SHARE_AUDIO_STATUS } from '@sharescreen/shared'
import type {
  ShareAudioStatus,
  ShareCodec,
  ShareRequest,
  StreamQualityPreset,
} from '@sharescreen/shared'
import { t } from '../../shared/i18n'
import { AudioPresets, ScreenSharePresets, Track, VideoPreset } from 'livekit-client'
import type { LocalParticipant, LocalTrackPublication } from 'livekit-client'
// no-inline: arquivo de verdade (data: URLs são bloqueadas pela CSP das janelas).
import workletUrl from './pcm-player.worklet.js?url&no-inline'

/** Presets de qualidade (docs/02 › Qualidade). */
const presets: Record<
  StreamQualityPreset,
  { width: number; height: number; fps: number; hint: string; encoding: VideoPreset }
> = {
  balanced: {
    width: 1280,
    height: 720,
    fps: 30,
    hint: 'motion',
    encoding: ScreenSharePresets.h720fps30,
  },
  /** 60 fps gastando metade da banda do 1080p60 (~4 Mbps): bom para conexões medianas. */
  smooth: {
    width: 1280,
    height: 720,
    fps: 60,
    hint: 'motion',
    encoding: new VideoPreset(1280, 720, 4_000_000, 60, 'high'),
  },
  motion: {
    width: 1920,
    height: 1080,
    fps: 30,
    hint: 'motion',
    encoding: ScreenSharePresets.h1080fps30,
  },
  /**
   * 60 fps para jogos e vídeos. Precisa de mais banda de quem transmite (~8 Mbps) e de
   * quem hospeda; a camada pequena (360p) continua para quem tem conexão fraca.
   */
  fluid: {
    width: 1920,
    height: 1080,
    fps: 60,
    hint: 'motion',
    encoding: new VideoPreset(1920, 1080, 8_000_000, 60, 'high'),
  },
}

/** Espera o MessagePort do som que o preload repassa via window.postMessage. */
function nextAudioPort(timeoutMs = 3000): Promise<MessagePort> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error(t('share.audio.timeout')))
    }, timeoutMs)
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.data?.type !== SHARE_AUDIO_PORT_MESSAGE) return
      const port = event.ports[0]
      if (!port) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve(port)
    }
    window.addEventListener('message', onMessage)
  })
}

export interface ActiveShare {
  /** Resultado do som: ligado, desligado por escolha, ou falhou (com o motivo). */
  audio: { state: 'on' } | { state: 'off' } | { state: 'failed'; reason: string }
  codec: 'h264' | 'vp8'
  preset: StreamQualityPreset
  publication: LocalTrackPublication
  /** Troca a qualidade sem parar a transmissão (nem escolher a fonte de novo). */
  retune(preset: StreamQualityPreset): Promise<void>
  stop(): Promise<void>
}

/**
 * H.264 pela placa de vídeo quando o PC tiver (o navegador diz se é "eficiente" = hardware);
 * senão VP8, que o processador faz bem. Comprimir 1080p60 no processador, com um jogo aberto,
 * é uma das causas de transmissão travando.
 */
export async function chooseCodec(
  wanted: ShareCodec | undefined,
  preset: StreamQualityPreset,
): Promise<'h264' | 'vp8'> {
  if (wanted === 'h264' || wanted === 'vp8') return wanted
  const p = presets[preset]
  try {
    const info = await navigator.mediaCapabilities.encodingInfo({
      type: 'webrtc',
      video: {
        contentType: 'video/H264',
        width: p.width,
        height: p.height,
        bitrate: p.encoding.encoding.maxBitrate,
        framerate: p.fps,
      },
    })
    console.info(
      `[call] H.264 ${p.width}x${p.height}@${p.fps}: suportado=${info.supported} hardware=${info.powerEfficient}`,
    )
    return info.supported && info.powerEfficient ? 'h264' : 'vp8'
  } catch {
    return 'vp8'
  }
}

/**
 * Publica a tela/janela escolhida e, se pedido, o som capturado nativamente.
 * `onEnded` é chamado se a fonte acabar sozinha (ex.: a janela compartilhada fechou).
 */
export async function startScreenShare(
  participant: LocalParticipant,
  request: ShareRequest,
  onEnded: () => void,
  onAudioStatus?: (status: ShareAudioStatus) => void,
): Promise<ActiveShare> {
  const preset = presets[request.preset]
  const codec = await chooseCodec(request.codec, request.preset)

  // O main entrega a fonte escolhida no seletor (setDisplayMediaRequestHandler).
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      // (getDisplayMedia não aceita `min`/`exact`: só ideal e max.)
      frameRate: { ideal: preset.fps, max: preset.fps },
    },
    audio: false,
  })
  const videoTrack = stream.getVideoTracks()[0]
  if (!videoTrack) throw new Error(t('share.noVideo'))
  videoTrack.contentHint = preset.hint
  const captured = videoTrack.getSettings()
  console.info(
    `[call] captura ${captured.width}x${captured.height} a ${Math.round(captured.frameRate ?? 0)} fps (pedido: ${preset.fps})`,
  )

  const publication = await participant.publishTrack(videoTrack, {
    name: 'screen',
    source: Track.Source.ScreenShare,
    videoCodec: codec,
    // A camada de 360p só é codificada enquanto alguém precisar dela (dynacast).
    simulcast: true,
    screenShareEncoding: preset.encoding.encoding,
    screenShareSimulcastLayers: [ScreenSharePresets.h360fps15],
    // 60 fps: prefere manter a fluidez e baixar a resolução quando a banda aperta.
    degradationPreference: preset.fps >= 60 ? 'maintain-framerate' : 'balanced',
  })

  let audioContext: AudioContext | null = null
  let audioTrack: MediaStreamTrack | null = null
  let port: MessagePort | null = null
  let audio: ActiveShare['audio'] = { state: 'off' }

  if (request.audio) {
    try {
      const portPromise = nextAudioPort()
      const result = await window.platform.share.startAudio({
        kind: request.kind,
        sourceId: request.sourceId,
      })
      if (!result.ok) {
        portPromise.catch(() => undefined)
        throw new Error(result.reason)
      }
      port = await portPromise

      audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
      await audioContext.audioWorklet.addModule(workletUrl)
      const player = new AudioWorkletNode(audioContext, 'pcm-player', {
        numberOfInputs: 0,
        outputChannelCount: [2],
      })
      const destination = audioContext.createMediaStreamDestination()
      player.connect(destination)
      port.onmessage = (event) => {
        const data = event.data as ShareAudioStatus | Uint8Array
        // No meio do PCM, o main manda avisos (som parou / voltou / captura não volta).
        if (!ArrayBuffer.isView(data) && data?.type === SHARE_AUDIO_STATUS) {
          onAudioStatus?.(data)
          return
        }
        player.port.postMessage(data)
      }
      await audioContext.resume()

      audioTrack = destination.stream.getAudioTracks()[0] ?? null
      if (!audioTrack) throw new Error(t('share.audio.trackFailed'))
      await participant.publishTrack(audioTrack, {
        name: 'screen-audio',
        source: Track.Source.ScreenShareAudio,
        audioPreset: AudioPresets.musicStereo,
        dtx: false,
        red: false,
        forceStereo: true,
      })
      audio = { state: 'on' }
    } catch (error) {
      window.platform.share.stopAudio()
      port?.close()
      await audioContext?.close().catch(() => undefined)
      audioContext = null
      audio = {
        state: 'failed',
        reason: error instanceof Error ? error.message : t('share.audio.failed'),
      }
    }
  }

  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    videoTrack.removeEventListener('ended', handleEnded)
    await participant.unpublishTrack(videoTrack, true).catch(() => undefined)
    videoTrack.stop()
    if (audioTrack) await participant.unpublishTrack(audioTrack, true).catch(() => undefined)
    if (request.audio) window.platform.share.stopAudio()
    port?.close()
    await audioContext?.close().catch(() => undefined)
  }

  // A janela compartilhada fechou ou o sistema encerrou a captura.
  function handleEnded() {
    void stop().then(onEnded)
  }
  videoTrack.addEventListener('ended', handleEnded)

  let current = request.preset
  const retune = async (next: StreamQualityPreset) => {
    if (stopped || next === current) return
    const target = presets[next]
    // Captura: resolução e fps novos.
    await videoTrack
      .applyConstraints({
        width: { ideal: target.width },
        height: { ideal: target.height },
        frameRate: { ideal: target.fps, max: target.fps },
      })
      .catch((error) => console.warn('[call] não consegui mudar a captura', error))
    // Codificação: a camada mais alta ganha o novo teto de banda e de fps.
    const sender = publication.track?.sender
    if (sender) {
      const params = sender.getParameters()
      const top = params.encodings.reduce<RTCRtpEncodingParameters | undefined>(
        (best, e) => (!best || (e.maxBitrate ?? 0) > (best.maxBitrate ?? 0) ? e : best),
        undefined,
      )
      if (top) {
        top.maxBitrate = target.encoding.encoding.maxBitrate
        top.maxFramerate = target.fps
      }
      // A camada de 360p foi calculada a partir da resolução antiga: refaz a escala para
      // continuar em ~360p (senão, de 1080p para 720p, ela cairia para 240p).
      for (const encoding of params.encodings) {
        if (encoding === top || (encoding.scaleResolutionDownBy ?? 1) <= 1) continue
        encoding.scaleResolutionDownBy = Math.max(1, target.height / 360)
      }
      params.degradationPreference = target.fps >= 60 ? 'maintain-framerate' : 'balanced'
      await sender.setParameters(params).catch((error) => {
        console.warn('[call] não consegui mudar a codificação', error)
      })
    }
    videoTrack.contentHint = target.hint
    current = next
    active.preset = next
    console.info(`[call] qualidade trocada para ${next}`)
  }

  const active: ActiveShare = {
    audio,
    codec,
    preset: request.preset,
    publication,
    retune,
    stop,
  }
  return active
}
