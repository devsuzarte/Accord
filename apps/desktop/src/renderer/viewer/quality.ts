import { ConnectionQuality, ParticipantEvent, VideoQuality } from 'livekit-client'
import type { RemoteParticipant, RemoteTrackPublication, RemoteVideoTrack } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'

/**
 * Qualidade da transmissão no viewer. Lê as estatísticas do WebRTC da tela recebida a cada
 * segundo (`getRTCStatsReport`) e junta com a conexão de quem transmite (o LiveKit manda
 * a qualidade de conexão de todo mundo da sala) para dizer ONDE está o gargalo.
 */
export type QualityLevel = 'good' | 'fair' | 'bad'

export type Diagnosis =
  | 'ok'
  | 'streamerNetwork'
  | 'myLoss'
  | 'latency'
  | 'lowLayer'
  | 'economy'
  | 'lowFps'
  | 'freezes'
  | 'warming'

export interface StreamStats {
  width: number
  height: number
  /** Resolução que quem transmite está mandando (camada mais alta). */
  sentWidth: number
  sentHeight: number
  fps: number
  /** Megabits por segundo recebidos. */
  mbps: number
  /** Perda de pacotes nos últimos ~5 s, em %. */
  lossPercent: number
  rttMs: number | null
  jitterMs: number
  freezes: number
  freezeSeconds: number
  codec: string
  /** UDP é o normal; TCP = UDP bloqueado no caminho (trava mais com perda). */
  route: 'udp' | 'tcp' | 'unknown'
  streamer: ConnectionQuality
  level: QualityLevel
  diagnosis: Diagnosis
}

export type QualityChoice = 'auto' | 'economy'

const CHOICE_KEY = 'sharescreen.viewer.quality'

export function readQualityChoice(): QualityChoice {
  try {
    return localStorage.getItem(CHOICE_KEY) === 'economy' ? 'economy' : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveQualityChoice(choice: QualityChoice): void {
  try {
    localStorage.setItem(CHOICE_KEY, choice)
  } catch {
    /* ignora */
  }
}

/** Automática = a melhor camada que a rede e o tamanho da janela aguentam; Econômica = 360p. */
export function applyQualityChoice(pub: RemoteTrackPublication, choice: QualityChoice): void {
  pub.setVideoQuality(choice === 'economy' ? VideoQuality.LOW : VideoQuality.HIGH)
}

interface Sample {
  at: number
  bytes: number
  lost: number
  received: number
}

const WINDOW_MS = 5000

export function useStreamQuality(
  track: RemoteVideoTrack | null,
  pub: RemoteTrackPublication | null,
  streamer: RemoteParticipant | null,
  choice: QualityChoice,
): StreamStats | null {
  const [stats, setStats] = useState<StreamStats | null>(null)
  // Refs: mudar a conexão de quem transmite ou a escolha não reinicia a contagem.
  const streamerQuality = useRef<ConnectionQuality>(ConnectionQuality.Unknown)
  const choiceRef = useRef(choice)
  useEffect(() => {
    choiceRef.current = choice
  }, [choice])

  useEffect(() => {
    if (!streamer) return
    const update = (quality: ConnectionQuality) => {
      streamerQuality.current = quality
    }
    update(streamer.connectionQuality)
    streamer.on(ParticipantEvent.ConnectionQualityChanged, update)
    return () => {
      streamer.off(ParticipantEvent.ConnectionQualityChanged, update)
    }
  }, [streamer])

  useEffect(() => {
    if (!track) return
    let stopped = false
    const samples: Sample[] = []
    let freezeBase: number | null = null
    const recentFreezes: { at: number; count: number }[] = []
    const startedAt = performance.now()

    const tick = async () => {
      const report = await track.getRTCStatsReport().catch(() => undefined)
      if (stopped || !report) return
      let inbound: Record<string, number | string | undefined> | null = null
      let rtt: number | null = null
      let localCandidate = ''
      const candidates = new Map<string, string>()
      const codecs = new Map<string, string>()
      report.forEach((entry: Record<string, unknown>) => {
        if (entry.type === 'inbound-rtp' && entry.kind === 'video') {
          inbound = entry as Record<string, number | string | undefined>
        }
        if (entry.type === 'codec' && typeof entry.mimeType === 'string') {
          codecs.set(String(entry.id), entry.mimeType.replace(/^video\//i, ''))
        }
        if (entry.type === 'local-candidate') {
          candidates.set(String(entry.id), String(entry.relayProtocol ?? entry.protocol ?? ''))
        }
        if (
          entry.type === 'candidate-pair' &&
          entry.state === 'succeeded' &&
          typeof entry.currentRoundTripTime === 'number' &&
          (entry.nominated === true || rtt === null)
        ) {
          rtt = entry.currentRoundTripTime * 1000
          localCandidate = String(entry.localCandidateId ?? '')
        }
      })
      if (!inbound) return
      const rtp = inbound as Record<string, number | string | undefined>
      const num = (key: string) => (typeof rtp[key] === 'number' ? (rtp[key] as number) : 0)
      const codec = codecs.get(String(rtp.codecId)) ?? ''
      const protocol = candidates.get(localCandidate) ?? ''
      const route: StreamStats['route'] =
        protocol === 'udp' ? 'udp' : protocol === 'tcp' || protocol === 'tls' ? 'tcp' : 'unknown'

      const now = performance.now()
      samples.push({
        at: now,
        bytes: num('bytesReceived'),
        lost: num('packetsLost'),
        received: num('packetsReceived'),
      })
      while (samples.length > 2 && now - samples[0]!.at > WINDOW_MS) samples.shift()
      const first = samples[0]!
      const last = samples[samples.length - 1]!
      const seconds = (last.at - first.at) / 1000
      const mbps = seconds > 0 ? ((last.bytes - first.bytes) * 8) / seconds / 1e6 : 0
      const lost = Math.max(0, last.lost - first.lost)
      const got = Math.max(0, last.received - first.received)
      const lossPercent = lost + got > 0 ? (lost / (lost + got)) * 100 : 0

      const freezeCount = num('freezeCount')
      if (freezeBase === null) freezeBase = freezeCount
      const freezes = freezeCount - freezeBase
      recentFreezes.push({ at: now, count: freezes })
      while (recentFreezes.length > 1 && now - recentFreezes[0]!.at > 10_000) recentFreezes.shift()
      const freezesRecent = freezes - recentFreezes[0]!.count

      const layer = pub?.dimensions
      const width = num('frameWidth')
      const height = num('frameHeight')
      const fps = num('framesPerSecond')
      const sentHeight = layer?.height ?? height
      const warming = now - startedAt < 3000 || height === 0

      const diagnosis = diagnose({
        warming,
        streamerPoor:
          streamerQuality.current === ConnectionQuality.Poor ||
          streamerQuality.current === ConnectionQuality.Lost,
        lossPercent,
        rtt,
        freezesRecent,
        lowLayer: height > 0 && sentHeight > 500 && height < sentHeight * 0.7,
        economy: choiceRef.current === 'economy',
        fps,
      })
      const level: QualityLevel = warming
        ? 'good'
        : lossPercent > 5 || fps < 12 || freezesRecent >= 2 || (rtt ?? 0) > 300
          ? 'bad'
          : diagnosis === 'ok' || diagnosis === 'economy'
            ? 'good'
            : 'fair'

      setStats({
        width,
        height,
        sentWidth: layer?.width ?? width,
        sentHeight,
        fps,
        mbps,
        lossPercent,
        rttMs: rtt,
        jitterMs: num('jitter') * 1000,
        freezes,
        freezeSeconds: num('totalFreezesDuration'),
        codec,
        route,
        streamer: streamerQuality.current,
        level,
        diagnosis,
      })
    }

    void tick()
    const timer = setInterval(() => void tick(), 1000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [track, pub])

  return track ? stats : null
}

/** Uma causa só, a mais provável — do lado de quem transmite primeiro, depois o seu. */
function diagnose(input: {
  warming: boolean
  streamerPoor: boolean
  lossPercent: number
  rtt: number | null
  freezesRecent: number
  lowLayer: boolean
  economy: boolean
  fps: number
}): Diagnosis {
  if (input.warming) return 'warming'
  if (input.streamerPoor) return 'streamerNetwork'
  if (input.lossPercent > 2) return 'myLoss'
  if ((input.rtt ?? 0) > 200) return 'latency'
  if (input.economy) return 'economy'
  if (input.lowLayer) return 'lowLayer'
  if (input.freezesRecent >= 2) return 'freezes'
  if (input.fps > 0 && input.fps < 20) return 'lowFps'
  return 'ok'
}
