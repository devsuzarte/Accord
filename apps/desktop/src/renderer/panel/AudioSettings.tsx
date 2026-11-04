import type { AudioState } from '@sharescreen/shared'
import { AudioLines, Bell, Mic, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../shared/i18n'
import { playTestSound, useAudioDevices, useMicLevel } from './useAudioDevices'

/** Painel visível? (o Electron marca a página como oculta quando a janela some) */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/**
 * Microfone e saída de som — antes de entrar e durante a chamada.
 * A escolha vai para o pill (dono da chamada), que salva e aplica na hora.
 */
export function AudioSettings({ audio }: { audio: AudioState }) {
  const t = useT()
  const { inputs, outputs } = useAudioDevices()
  const visible = usePageVisible()
  const level = useMicLevel(audio.inputDeviceId, visible && !audio.micMuted)
  const [testing, setTesting] = useState(false)

  const test = async () => {
    setTesting(true)
    await playTestSound(audio.outputDeviceId)
    setTimeout(() => setTesting(false), 700)
  }

  return (
    <div className="audio">
      <label className="field">
        <span className="field__label">
          <Mic size={14} /> {t('audio.mic')}
        </span>
        <select
          className="field__input field__select"
          value={audio.inputDeviceId}
          onChange={(e) =>
            window.platform.call.command({ type: 'set-input', deviceId: e.target.value })
          }
        >
          <option value="">{t('audio.systemDefault')}</option>
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <span
          className="meter"
          data-muted={audio.micMuted || undefined}
          aria-label={audio.micMuted ? t('audio.summaryMicOff') : t('audio.micLevel')}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
        >
          <span className="meter__fill" style={{ transform: `scaleX(${level})` }} />
        </span>
      </label>

      <label className="field">
        <span className="field__label">
          <Volume2 size={14} /> {t('audio.output')}
        </span>
        <span className="field__row">
          <select
            className="field__input field__select"
            value={audio.outputDeviceId}
            onChange={(e) =>
              window.platform.call.command({ type: 'set-output', deviceId: e.target.value })
            }
          >
            <option value="">{t('audio.systemDefault')}</option>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <button type="button" className="action action--small" onClick={test} disabled={testing}>
            {testing ? t('audio.testing') : t('audio.test')}
          </button>
        </span>
      </label>

      <div className="row">
        <div>
          <p className="row__title">
            <AudioLines size={15} /> {t('audio.noise')}
          </p>
          <p className="row__text">
            {audio.noiseSuppression === 'rnnoise' ? t('audio.noiseOn') : t('audio.noiseOff')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={audio.noiseSuppression === 'rnnoise'}
          aria-label={t('audio.noiseLabel')}
          className="switch"
          onClick={() =>
            window.platform.call.command({
              type: 'set-noise',
              mode: audio.noiseSuppression === 'rnnoise' ? 'standard' : 'rnnoise',
            })
          }
        />
      </div>

      <div className="row">
        <div>
          <p className="row__title">
            <Bell size={15} /> {t('audio.sounds')}
          </p>
          <p className="row__text">{t('audio.soundsText')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={audio.sounds}
          aria-label={t('audio.sounds')}
          className="switch"
          onClick={() =>
            window.platform.call.command({ type: 'set-sounds', enabled: !audio.sounds })
          }
        />
      </div>
    </div>
  )
}
