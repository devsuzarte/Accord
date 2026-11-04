import type { UpdateState } from '@sharescreen/shared'
import { Download, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../shared/i18n'

/** Situação da atualização automática, na aba Você. */
export function UpdateSection() {
  const t = useT()
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    window.platform.update.getState().then(setState).catch(console.error)
    return window.platform.update.onChange(setState)
  }, [])

  if (!state) return null
  const version = state.version ?? ''
  const text =
    state.status === 'downloading'
      ? t('update.downloading', { version, progress: state.progress })
      : state.status === 'ready'
        ? t('update.ready', { version })
        : t(`update.${state.status}`)

  return (
    <div className="update">
      <div className="update__text">
        <p className="row__title">{t('update.title')}</p>
        <p className="row__text">{text}</p>
      </div>
      {state.status === 'ready' ? (
        <button
          type="button"
          className="action action--small action--primary"
          onClick={() => window.platform.update.install()}
        >
          <Download size={14} /> {t('update.install')}
        </button>
      ) : (
        state.status !== 'disabled' && (
          <button
            type="button"
            className="action action--small"
            disabled={state.status === 'checking' || state.status === 'downloading'}
            onClick={() => window.platform.update.check()}
          >
            <RefreshCw size={14} /> {t('update.check')}
          </button>
        )
      )}
    </div>
  )
}
