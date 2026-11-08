import { ConnectionQuality } from 'livekit-client'
import type { MessageKey } from '@sharescreen/shared'
import { Activity } from 'lucide-react'
import { useLanguage, useT } from '../shared/i18n'
import type { QualityChoice, StreamStats } from './quality'

const connectionKey: Record<ConnectionQuality, MessageKey> = {
  [ConnectionQuality.Excellent]: 'viewer.quality.conn.excellent',
  [ConnectionQuality.Good]: 'viewer.quality.conn.good',
  [ConnectionQuality.Poor]: 'viewer.quality.conn.poor',
  [ConnectionQuality.Lost]: 'viewer.quality.conn.lost',
  [ConnectionQuality.Unknown]: 'viewer.quality.conn.unknown',
}

const levelKey = {
  good: 'viewer.quality.good',
  fair: 'viewer.quality.fair',
  bad: 'viewer.quality.bad',
} as const

/** "1080p" para as resoluções comuns, "1600×900" para as outras. */
function shortSize(height: number): string {
  return height > 0 ? `${height}p` : '—'
}

export function QualityBadge({
  stats,
  open,
  onToggle,
}: {
  stats: StreamStats | null
  open: boolean
  onToggle(): void
}) {
  const t = useT()
  if (!stats) return null
  return (
    <button
      type="button"
      className="viewer__quality"
      data-level={stats.level}
      aria-expanded={open}
      aria-label={`${t('viewer.quality.button')}: ${t(levelKey[stats.level])}`}
      title={t('viewer.quality.button')}
      onClick={onToggle}
    >
      <span className="viewer__dot" aria-hidden />
      {shortSize(stats.height)}
      <span className="viewer__quality-fps">{Math.round(stats.fps)} fps</span>
    </button>
  )
}

export function QualityPanel({
  stats,
  streamerName,
  choice,
  onChoice,
}: {
  stats: StreamStats
  streamerName: string
  choice: QualityChoice
  onChoice(choice: QualityChoice): void
}) {
  const t = useT()
  const { locale } = useLanguage()
  const n = (value: number, digits = 0) =>
    value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  const resized = stats.sentHeight > 0 && stats.sentHeight !== stats.height

  const rows: [string, string, string?][] = [
    [
      t('viewer.quality.resolution'),
      stats.width ? `${stats.width}×${stats.height}` : '—',
      resized
        ? t('viewer.quality.sent', { size: `${stats.sentWidth}×${stats.sentHeight}` })
        : undefined,
    ],
    [t('viewer.quality.fps'), n(stats.fps)],
    [t('viewer.quality.bitrate'), `${n(stats.mbps, 1)} Mbps`],
    [t('viewer.quality.loss'), `${n(stats.lossPercent, 1)}%`],
    [t('viewer.quality.rtt'), stats.rttMs === null ? '—' : `${n(stats.rttMs)} ms`],
    [t('viewer.quality.jitter'), `${n(stats.jitterMs)} ms`],
    [
      t('viewer.quality.freezes'),
      t('viewer.quality.freezesValue', { n: stats.freezes, s: n(stats.freezeSeconds, 1) }),
    ],
    [t('viewer.quality.streamer', { name: streamerName }), t(connectionKey[stats.streamer])],
  ]
  if (stats.codec) rows.push([t('viewer.quality.codec'), stats.codec])
  if (stats.route !== 'unknown') {
    rows.push([t('viewer.quality.route'), t(`viewer.quality.route.${stats.route}`)])
  }

  const hint = t(`viewer.diag.${stats.diagnosis}` as MessageKey, {
    name: streamerName,
    ms: n(stats.rttMs ?? 0),
  })

  return (
    <section
      className="viewer__stats"
      aria-label={t('viewer.quality.button')}
      onMouseMove={(event) => event.stopPropagation()}
    >
      <p className="viewer__stats-head" data-level={stats.level}>
        <Activity size={16} aria-hidden />
        {t('viewer.quality.title')}: {t(levelKey[stats.level])}
      </p>
      <p className="viewer__diagnosis">{hint}</p>
      {stats.route === 'tcp' && stats.level !== 'good' && (
        <p className="viewer__diagnosis">{t('viewer.diag.tcp')}</p>
      )}
      <dl className="viewer__rows">
        {rows.map(([label, value, extra]) => (
          <div key={label} className="viewer__row">
            <dt>{label}</dt>
            <dd>
              {value}
              {extra && <span className="viewer__extra">{extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <fieldset className="viewer__choice">
        <legend>{t('viewer.quality.choice')}</legend>
        {(['auto', 'economy'] as const).map((option) => (
          <label key={option} className="viewer__option">
            <input
              type="radio"
              name="quality"
              checked={choice === option}
              onChange={() => onChoice(option)}
            />
            <span>
              <strong>
                {t(option === 'auto' ? 'viewer.quality.auto' : 'viewer.quality.economy')}
              </strong>
              <small>
                {t(option === 'auto' ? 'viewer.quality.autoHint' : 'viewer.quality.economyHint')}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
