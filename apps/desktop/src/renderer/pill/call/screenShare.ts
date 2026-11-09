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
  /**
   * Troca o que está sendo transmitido (outra tela ou janela) sem parar: a mesma publicação
   * recebe a captura nova (`replaceTrack`), então quem assiste continua assistindo. O som
   * acompanha a fonte nova. O codec não muda.
   */
  switchSource(request: ShareRequest): Promise<void>
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
 * Pede a captura da fonte que a pessoa escolheu no seletor: o main entrega essa fonte no
 * `setDisplayMediaRequestHandler`.
 */
async function captureSource(presetId: StreamQualityPreset): Promise<MediaStreamTrack> {
  const preset = presets[presetId]
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      // (getDisplayMedia não aceita `min`/`exact`: só ideal e max.)
      frameRate: { ideal: preset.fps, max: preset.fps },
    },
    audio: false,
  })
  const track = stream.getVideoTracks()[0]
  if (!track) throw new Error(t('share.noVideo'))
  track.contentHint = preset.hint
  const captured = track.getSettings()
  console.info(
    `[call] captura ${captured.width}x${captured.height} a ${Math.round(captured.frameRate ?? 0)} fps (pedido: ${preset.fps})`,
  )
  return track
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
  let videoTrack = await captureSource(request.preset)

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
  let player: AudioWorkletNode | null = null
  let audio: ActiveShare['audio'] = { state: 'off' }

  /** Liga a captura nativa da fonte e entrega o PCM ao tocador (já criado). */
  const bindAudioSource = async (source: ShareRequest) => {
    const portPromise = nextAudioPort()
    // O main para a captura anterior (e fecha o port antigo) antes de começar a nova.
    const result = await window.platform.share.startAudio({
      kind: source.kind,
      sourceId: source.sourceId,
    })
    if (!result.ok) {
      portPromise.catch(() => undefined)
      throw new Error(result.reason)
    }
    const next = await portPromise
    const target = player
    next.onmessage = (event) => {
      const data = event.data as ShareAudioStatus | Uint8Array
      // No meio do PCM, o main manda avisos (som parou / voltou / captura não volta).
      if (!ArrayBuffer.isView(data) && data?.type === SHARE_AUDIO_STATUS) {
        onAudioStatus?.(data)
        return
      }
      target?.port.postMessage(data)
    }
    port?.close()
    port = next
  }

  /** Som da transmissão: tocador + faixa publicada (uma vez) + captura da fonte. */
  const startAudio = async (source: ShareRequest) => {
    try {
      if (!player) {
        audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
        await audioContext.audioWorklet.addModule(workletUrl)
        player = new AudioWorkletNode(audioContext, 'pcm-player', {
          numberOfInputs: 0,
          outputChannelCount: [2],
        })
        const destination = audioContext.createMediaStreamDestination()
        player.connect(destination)
        await bindAudioSource(source)
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
      } else {
        // Trocou de fonte: a faixa publicada continua; só a captura por trás muda.
        await bindAudioSource(source)
      }
      audio = { state: 'on' }
    } catch (error) {
      await stopAudio()
      audio = {
        state: 'failed',
        reason: error instanceof Error ? error.message : t('share.audio.failed'),
      }
    }
    active.audio = audio
  }

  const stopAudio = async () => {
    window.platform.share.stopAudio()
    if (audioTrack) await participant.unpublishTrack(audioTrack, true).catch(() => undefined)
    audioTrack = null
    port?.close()
    port = null
    player = null
    await audioContext?.close().catch(() => undefined)
    audioContext = null
    audio = { state: 'off' }
  }

  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    videoTrack.removeEventListener('ended', handleEnded)
    // Depois de uma troca, a faixa publicada é a nova: tira pela publicação.
    const published = publication.track ?? videoTrack
    await participant.unpublishTrack(published, true).catch(() => undefined)
    videoTrack.stop()
    await stopAudio()
  }

  // A janela compartilhada fechou ou o sistema encerrou a captura.
  function handleEnded() {
    void stop().then(onEnded)
  }
  videoTrack.addEventListener('ended', handleEnded)

  /** Aplica um preset na captura e na codificação (sem conferir se mudou). */
  const applyPreset = async (next: StreamQualityPreset) => {
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
  }

  let current = request.preset
  const retune = async (next: StreamQualityPreset) => {
    if (stopped || next === current) return
    await applyPreset(next)
    console.info(`[call] qualidade trocada para ${next}`)
  }

  let source = request
  const switchSource = async (next: ShareRequest) => {
    if (stopped) return
    const sourceChanged = next.sourceId !== source.sourceId
    if (sourceChanged) {
      const fresh = await captureSource(next.preset)
      const local = publication.track
      if (!local) {
        fresh.stop()
        throw new Error(t('share.noVideo'))
      }
      videoTrack.removeEventListener('ended', handleEnded)
      try {
        // Mesma publicação, captura nova: quem assiste não precisa reconectar.
        await local.replaceTrack(fresh, { userProvidedTrack: true })
      } catch (error) {
        fresh.stop()
        videoTrack.addEventListener('ended', handleEnded)
        throw error
      }
      const previous = videoTrack
      videoTrack = fresh
      fresh.addEventListener('ended', handleEnded)
      previous.stop()
      console.info(`[call] transmissão trocada para ${next.kind} "${next.sourceName}"`)
    }
    // O LiveKit refaz a codificação a partir das opções da publicação depois da troca:
    // reaplica a qualidade escolhida (que pode ter mudado no seletor ou no painel).
    if (sourceChanged || next.preset !== current) await applyPreset(next.preset)
    // Som: acompanha a fonte nova, liga ou desliga conforme a escolha.
    const audioWanted = next.audio
    const audioRunning = audio.state === 'on'
    if (audioWanted && (sourceChanged || !audioRunning)) await startAudio(next)
    else if (!audioWanted && (audioRunning || player)) await stopAudio()
    active.audio = audio
    source = next
  }

  const active: ActiveShare = {
    audio,
    codec,
    preset: request.preset,
    publication,
    retune,
    switchSource,
    stop,
  }
  if (request.audio) await startAudio(request)
  return active
}
