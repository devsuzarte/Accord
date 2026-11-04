import { SHARE_AUDIO_PORT_MESSAGE } from '@sharescreen/shared'
import type { ShareRequest, StreamQualityPreset } from '@sharescreen/shared'
import { t } from '../../shared/i18n'
import { AudioPresets, ScreenSharePresets, Track, VideoPreset } from 'livekit-client'
import type { LocalParticipant } from 'livekit-client'
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
  stop(): Promise<void>
}

/**
 * Publica a tela/janela escolhida e, se pedido, o som capturado nativamente.
 * `onEnded` é chamado se a fonte acabar sozinha (ex.: a janela compartilhada fechou).
 */
export async function startScreenShare(
  participant: LocalParticipant,
  request: ShareRequest,
  onEnded: () => void,
): Promise<ActiveShare> {
  const preset = presets[request.preset]

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

  await participant.publishTrack(videoTrack, {
    name: 'screen',
    source: Track.Source.ScreenShare,
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
      port.onmessage = (event) => player.port.postMessage(event.data)
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

  return { audio, stop }
}
