import { PRESET_MBPS } from '@sharescreen/shared'
import type { CallSnapshot, HostState, StreamQualityPreset } from '@sharescreen/shared'
import { Activity, ArrowLeftRight, Gauge, Loader, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useT } from '../shared/i18n'

const presets: StreamQualityPreset[] = ['balanced', 'smooth', 'motion', 'fluid']
const presetDetail: Record<StreamQualityPreset, string> = {
  balanced: '720p30',
  smooth: '720p60',
  motion: '1080p30',
  fluid: '1080p60',
}

const mbps = (value: number) => (value >= 10 ? value.toFixed(0) : value.toFixed(1))

/**
 * "Sua transmissão": o que está saindo de verdade, quem comprime (placa de vídeo ou processador),
 * o que está segurando a qualidade e como está chegando para quem assiste.
 */
export function ShareHealth({ call }: { call: CallSnapshot }) {
  const t = useT()
  const sharing = call.status === 'idle' ? null : call.sharing
  if (!sharing) return null
  const stats = call.shareStats
  const advice = call.shareAdvice

  return (
    <section className="health" aria-label={t('health.title')}>
      <p className="row__title">
        <Activity size={15} /> {t('health.title')}
      </p>

      {stats ? (
        <dl className="health__grid">
          <dt>{t('health.sending')}</dt>
          <dd>
            {stats.height > 0 ? `${stats.width}×${stats.height}, ${stats.fps} fps` : '—'} ·{' '}
            {mbps(stats.mbps)} Mbps
          </dd>
          <dt>{t('health.encoder')}</dt>
          <dd title={stats.encoderName || undefined}>
            {stats.codec} · {t(`health.encoder.${stats.encoder}`)}
          </dd>
          <dt>{t('health.route')}</dt>
          <dd data-warn={stats.transport === 'tcp' || undefined}>
            {t(`health.transport.${stats.transport}`)}
            {stats.rttMs !== null && ` · ${stats.rttMs} ms`}
          </dd>
          <dt>{t('health.viewers')}</dt>
          <dd>
            {stats.viewers.count === 0
              ? t('health.viewers.none')
              : t('health.viewers.summary', {
                  good: stats.viewers.good,
                  fair: stats.viewers.fair,
                  bad: stats.viewers.bad,
                })}
          </dd>
        </dl>
      ) : (
        <p className="row__text">{t('health.measuring')}</p>
      )}

      {stats?.limit === 'cpu' && <p className="notice notice--warn">{t('health.limit.cpu')}</p>}
      {stats?.limit === 'bandwidth' && (
        <p className="notice notice--warn">{t('health.limit.bandwidth')}</p>
      )}
      {stats?.transport === 'tcp' && <p className="notice notice--warn">{t('health.tcp')}</p>}
      {stats && stats.viewers.struggling.length > 0 && (
        <p className="notice notice--warn">
          {t('health.struggling', {
            names: stats.viewers.struggling.map((v) => v.name).join(', '),
          })}
        </p>
      )}

      {advice && (
        <div className="notice notice--warn notice--row">
          <span>
            {t(`health.advice.${advice.reason}`, { preset: t(`preset.${advice.preset}`) })}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() =>
              window.platform.call.command({ type: 'retune-share', preset: advice.preset })
            }
          >
            {t('health.lower')}
          </button>
        </div>
      )}

      <button
        type="button"
        className="action"
        onClick={() => window.platform.call.command({ type: 'switch-share' })}
      >
        <ArrowLeftRight size={15} /> {t('health.switch')}
      </button>

      <label className="field">
        <span className="field__label">{t('health.quality')}</span>
        <select
          className="field__input field__select"
          value={sharing.preset}
          onChange={(e) =>
            window.platform.call.command({
              type: 'retune-share',
              preset: e.target.value as StreamQualityPreset,
            })
          }
        >
          {presets.map((id) => (
            <option key={id} value={id}>
              {t(`preset.${id}`)} ({presetDetail[id]})
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <div>
          <p className="row__title">{t('health.auto')}</p>
          <p className="row__text">{t('health.autoText')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={call.shareAutoQuality}
          aria-label={t('health.auto')}
          className="switch"
          onClick={() =>
            window.platform.call.command({ type: 'auto-quality', enabled: !call.shareAutoQuality })
          }
        />
      </div>
    </section>
  )
}

/**
 * Teste de rede até o host: baixa e manda alguns MB. Quem não é o host transmite mandando para
 * o host, então a subida (↑) diz que qualidade cabe; a descida (↓) é a subida do host até você.
 */
export function NetworkTest({ call, isHost }: { call: CallSnapshot; isHost: boolean }) {
  const t = useT()
  if (call.status !== 'connected') return null
  if (isHost) return <p className="hint hint--flush">{t('speed.hostHint')}</p>
  const result = call.speedTest
  const running = result?.state === 'running'
  const fits = result?.upMbps
    ? presets.filter((id) => PRESET_MBPS[id] * 1.25 <= result.upMbps!)
    : []

  return (
    <section className="health" aria-label={t('speed.title')}>
      <div className="row">
        <div>
          <p className="row__title">
            <Gauge size={15} /> {t('speed.title')}
          </p>
          <p className="row__text">{t('speed.text')}</p>
        </div>
        <button
          type="button"
          className="action action--small"
          disabled={running}
          onClick={() => window.platform.call.command({ type: 'speed-test' })}
        >
          {running && <Loader size={14} className="spin" />}
          {running ? t('speed.running') : t('speed.run')}
        </button>
      </div>
      {result?.state === 'failed' && <p className="notice notice--error">{t('speed.failed')}</p>}
      {result?.state === 'done' && (
        <>
          <dl className="health__grid">
            <dt>{t('speed.up')}</dt>
            <dd>{mbps(result.upMbps ?? 0)} Mbps</dd>
            <dt>{t('speed.down')}</dt>
            <dd>{mbps(result.downMbps ?? 0)} Mbps</dd>
            <dt>{t('speed.rtt')}</dt>
            <dd>{result.rttMs} ms</dd>
          </dl>
          <p className="row__text">
            {fits.length
              ? t('speed.fits', { preset: t(`preset.${fits[fits.length - 1]!}`) })
              : t('speed.fitsNone')}
          </p>
        </>
      )}
    </section>
  )
}

/**
 * Quanto de internet quem hospeda precisa: cada pessoa assistindo recebe uma cópia
 * (o servidor não recomprime). É a conta que mais derruba transmissão.
 */
export function BandwidthTable() {
  const t = useT()
  const counts = [1, 2, 4, 6]
  return (
    <details className="band">
      <summary className="band__summary">{t('bandwidth.title')}</summary>
      <p className="row__text">{t('bandwidth.text')}</p>
      <table className="band__table">
        <thead>
          <tr>
            <td />
            <th scope="colgroup" colSpan={counts.length} className="band__group">
              {t('bandwidth.viewers')}
            </th>
          </tr>
          <tr>
            <th scope="col">{t('bandwidth.quality')}</th>
            {counts.map((n) => (
              <th key={n} scope="col">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {presets.map((id) => (
            <tr key={id}>
              <th scope="row">
                {t(`preset.${id}`)} <span className="band__detail">{presetDetail[id]}</span>
              </th>
              {counts.map((n) => (
                <td key={n}>{Math.ceil(PRESET_MBPS[id] * n)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="row__text">{t('bandwidth.note')}</p>
    </details>
  )
}

/** Regra do firewall do Windows para quem vem pela rede (só redes privadas e VPNs). */
export function FirewallRow({ host }: { host: HostState }) {
  const t = useT()
  if (host.firewall === 'unsupported') return null
  const ok = host.firewall === 'ok'
  return (
    <div className="row">
      <div>
        <p className="row__title">
          {ok ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />} {t('firewall.title')}
        </p>
        <p className="row__text">{t(`firewall.${host.firewall}`)}</p>
      </div>
      {!ok && (
        <button
          type="button"
          className="action action--small"
          onClick={() => void window.platform.host.allowFirewall()}
        >
          {t('firewall.allow')}
        </button>
      )}
    </div>
  )
}
