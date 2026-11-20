import type { GifProvider } from '@sharescreen/shared'
import { Check, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../shared/i18n'
import { PasswordInput } from './PasswordInput'

const links: Record<GifProvider, string> = {
  klipy: 'https://klipy.com/developers',
  giphy: 'https://developers.giphy.com/dashboard/',
}

/**
 * Busca de GIFs do chat: quem hospeda põe uma chave do KLIPY (grátis) ou do GIPHY. A chave
 * fica só neste PC e no servidor aberto por ele; quem entra na call nunca a vê.
 */
export function GifSettings() {
  const t = useT()
  const [provider, setProvider] = useState<GifProvider>('klipy')
  const [key, setKey] = useState('')
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    window.platform.gifs
      .getSettings()
      .then((saved) => {
        if (!saved) return
        setProvider(saved.provider)
        setKey(saved.key)
      })
      .catch(console.error)
  }, [])

  const save = async (value: { provider: GifProvider; key: string } | null) => {
    const ok = await window.platform.gifs.setSettings(value)
    setState(ok ? 'saved' : 'failed')
  }

  return (
    <details className="band gifs">
      <summary className="band__summary">{t('gifs.title')}</summary>
      <p className="field__hint">{t('gifs.text')}</p>
      <label className="field">
        <span className="field__label">{t('gifs.provider')}</span>
        <select
          className="field__input field__select"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as GifProvider)
            setState('idle')
          }}
        >
          <option value="klipy">KLIPY ({t('gifs.free')})</option>
          <option value="giphy">GIPHY</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">{t('gifs.key')}</span>
        <PasswordInput
          value={key}
          onChange={(value) => {
            setKey(value)
            setState('idle')
          }}
          placeholder={t('gifs.keyPlaceholder')}
          maxLength={200}
        />
        <a
          className="field__hint gifs__link"
          href={links[provider]}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={12} aria-hidden /> {t('gifs.getKey')}
        </a>
      </label>
      <div className="gifs__actions">
        <button
          type="button"
          className="action action--small"
          disabled={!key.trim()}
          onClick={() => void save({ provider, key: key.trim() })}
        >
          <Check size={14} />
          {t('gifs.save')}
        </button>
        {key && (
          <button
            type="button"
            className="action action--small action--quiet"
            onClick={() => {
              setKey('')
              void save(null)
            }}
          >
            {t('gifs.clear')}
          </button>
        )}
      </div>
      {state === 'saved' && <p className="hint hint--flush">{t('gifs.saved')}</p>}
      {state === 'failed' && <p className="notice notice--error">{t('gifs.failed')}</p>}
    </details>
  )
}
