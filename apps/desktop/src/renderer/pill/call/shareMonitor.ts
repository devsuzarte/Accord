import type {
  CallSnapshot,
  ShareStats,
  StreamQualityPreset,
  StreamReport,
  ViewerReportSummary,
} from '@sharescreen/shared'
import { PRESET_LOWER } from '@sharescreen/shared'
import type { ActiveShare } from './screenShare'

/**
 * Diagnóstico de quem transmite. A cada 2 s lê as estatísticas do envio (o próprio Chromium diz
 * se o vídeo está sendo segurado pelo processador ou pela banda, e se o codificador é da placa
 * de vídeo) e junta com os relatos de quem assiste (`accord.stream-report`).
 *
 * Daí sai a sugestão de baixar um degrau de qualidade; com "qualidade automática" ligada, baixa
 * sozinho (no máximo uma vez a cada 30 s, e nunca abaixo de Equilibrada).
 */
type Advice = CallSnapshot['shareAdvice']

interface Sample {
  at: number
  bytes: number
  /** Bytes e quadros de cada camada (por id do outbound-rtp). */
  layers: Map<string, { bytes: number; frames: number }>
}

interface ViewerEntry {
  name: string
  level: StreamReport['level']
  diagnosis: string
  at: number
}

/** Relato vale por 12 s: quem fechou a janela some sozinho. */
const REPORT_TTL_MS = 12_000
/** Tempo seguido com problema antes de sugerir (evita reagir a um soluço). */
const ADVICE_AFTER_MS = 8_000
const AUTO_COOLDOWN_MS = 30_000
/** Diagnósticos que são culpa de quem transmite (não da internet de quem assiste). */
const STREAMER_SIDE = new Set(['streamerNetwork', 'lowFps', 'freezes'])

export interface ShareMonitor {
  report(report: StreamReport): void
  setAuto(enabled: boolean): void
  stop(): void
}

export function startShareMonitor(
  share: ActiveShare,
  options: {
    auto: () => boolean
    onUpdate(stats: ShareStats, advice: Advice): void
    onRetune(preset: StreamQualityPreset): void
  },
): ShareMonitor {
  const viewers = new Map<string, ViewerEntry>()
  let previous: Sample | null = null
  let troubleSince: number | null = null
  let troubleReason: NonNullable<Advice>['reason'] | null = null
  let lastAuto = 0
  let stopped = false

  const summary = (now: number): ViewerReportSummary => {
    for (const [id, v] of viewers) if (now - v.at > REPORT_TTL_MS) viewers.delete(id)
    const list = [...viewers.values()]
    return {
      count: list.length,
      good: list.filter((v) => v.level === 'good').length,
      fair: list.filter((v) => v.level === 'fair').length,
      bad: list.filter((v) => v.level === 'bad').length,
      struggling: list
        .filter((v) => v.level === 'bad')
        .map((v) => ({ name: v.name, diagnosis: v.diagnosis })),
    }
  }

  const tick = async () => {
    const track = share.publication.track
    const report = await track?.getRTCStatsReport().catch(() => undefined)
    if (stopped || !report) return

    const outbound: Record<string, unknown>[] = []
    const codecs = new Map<string, string>()
    const candidates = new Map<string, Record<string, unknown>>()
    let pair: Record<string, unknown> | null = null
    report.forEach((entry: Record<string, unknown>) => {
      if (entry.type === 'outbound-rtp' && entry.kind === 'video') outbound.push(entry)
      if (entry.type === 'codec' && typeof entry.mimeType === 'string') {
        codecs.set(String(entry.id), entry.mimeType.replace(/^video\//i, ''))
      }
      if (entry.type === 'local-candidate') candidates.set(String(entry.id), entry)
      if (entry.type === 'candidate-pair' && entry.state === 'succeeded') {
        if (!pair || entry.nominated === true) pair = entry
      }
    })
    if (outbound.length === 0) return

    const num = (e: Record<string, unknown>, k: string) =>
      typeof e[k] === 'number' ? (e[k] as number) : 0
    const now = performance.now()
    const sample: Sample = {
      at: now,
      bytes: outbound.reduce((sum, e) => sum + num(e, 'bytesSent'), 0),
      layers: new Map(
        outbound.map((e) => [
          String(e.id),
          { bytes: num(e, 'bytesSent'), frames: num(e, 'framesSent') },
        ]),
      ),
    }
    // A camada mais alta que está de fato saindo: com dynacast, a camada que ninguém está
    // recebendo para (fica com a última resolução, mas sem bytes novos).
    const sending = previous
      ? outbound.filter(
          (e) => num(e, 'bytesSent') > (previous!.layers.get(String(e.id))?.bytes ?? 0),
        )
      : outbound
    const pool = sending.length ? sending : outbound
    const top = pool.reduce((best, e) =>
      num(e, 'frameHeight') > num(best, 'frameHeight') ? e : best,
    )
    const seconds = previous ? (now - previous.at) / 1000 : 0
    const mbps = previous && seconds > 0 ? ((sample.bytes - previous.bytes) * 8) / seconds / 1e6 : 0
    const before = previous?.layers.get(String(top.id))
    const measuredFps =
      before && seconds > 0 ? Math.max(0, (num(top, 'framesSent') - before.frames) / seconds) : 0
    previous = sample

    const implementation =
      typeof top.encoderImplementation === 'string' ? top.encoderImplementation : ''
    const encoder: ShareStats['encoder'] =
      top.powerEfficientEncoder === true
        ? 'hardware'
        : top.powerEfficientEncoder === false
          ? 'software'
          : /mediafoundation|nvenc|amf|qsv|vaapi|videotoolbox|d3d/i.test(implementation)
            ? 'hardware'
            : implementation
              ? 'software'
              : 'unknown'
    const reason = String(top.qualityLimitationReason ?? 'none')
    const limit: ShareStats['limit'] =
      reason === 'cpu'
        ? 'cpu'
        : reason === 'bandwidth'
          ? 'bandwidth'
          : reason === 'none'
            ? 'none'
            : 'other'

    const chosen = pair as Record<string, unknown> | null
    const local = chosen ? candidates.get(String(chosen.localCandidateId)) : undefined
    const protocol = String(local?.relayProtocol ?? local?.protocol ?? '')
    const transport: ShareStats['transport'] =
      protocol === 'udp' ? 'udp' : protocol === 'tcp' || protocol === 'tls' ? 'tcp' : 'unknown'
    const rtt =
      chosen && typeof chosen.currentRoundTripTime === 'number'
        ? Math.round(chosen.currentRoundTripTime * 1000)
        : null

    const viewersNow = summary(Date.now())
    const stats: ShareStats = {
      width: num(top, 'frameWidth'),
      height: num(top, 'frameHeight'),
      fps: Math.round(num(top, 'framesPerSecond') || measuredFps),
      mbps,
      codec: codecs.get(String(top.codecId)) ?? share.codec.toUpperCase(),
      encoder,
      encoderName: implementation,
      limit,
      transport,
      rttMs: rtt,
      viewers: viewersNow,
    }

    // Problema agora? Do lado de quem transmite (processador/banda) ou de vários que assistem.
    const streamerSideBad = viewersNow.struggling.filter((v) => STREAMER_SIDE.has(v.diagnosis))
    const reasonNow: NonNullable<Advice>['reason'] | null =
      limit === 'cpu'
        ? 'cpu'
        : limit === 'bandwidth'
          ? 'bandwidth'
          : streamerSideBad.length > 0 && streamerSideBad.length * 2 >= viewersNow.count
            ? 'viewers'
            : null
    if (reasonNow) {
      if (troubleSince === null || troubleReason !== reasonNow) troubleSince = now
      troubleReason = reasonNow
    } else {
      troubleSince = null
      troubleReason = null
    }
    const lower = PRESET_LOWER[share.preset]
    const advice: Advice =
      lower && troubleReason && troubleSince !== null && now - troubleSince >= ADVICE_AFTER_MS
        ? { preset: lower, reason: troubleReason }
        : null
    options.onUpdate(stats, advice)

    if (advice && options.auto() && now - lastAuto > AUTO_COOLDOWN_MS) {
      lastAuto = now
      troubleSince = null
      options.onRetune(advice.preset)
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), 2000)

  return {
    report(report) {
      viewers.set(report.viewer, {
        name: report.from,
        level: report.level,
        diagnosis: report.diagnosis,
        at: Date.now(),
      })
    },
    setAuto(enabled) {
      if (enabled) lastAuto = 0
    },
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
