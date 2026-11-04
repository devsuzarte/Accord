import type { MessageKey, ShareKind, ShareSource, StreamQualityPreset } from '@sharescreen/shared'
import { AppWindow, Monitor, X } from 'lucide-react'
import { useT } from '../shared/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'

const presetOptions: Array<{ id: StreamQualityPreset; detail: string; title?: MessageKey }> = [
  { id: 'detail', detail: '1080p, 15 fps' },
  { id: 'balanced', detail: '720p, 30 fps' },
  { id: 'motion', detail: '1080p, 30 fps' },
  { id: 'fluid', detail: '1080p, 60 fps', title: 'preset.fluidTitle' },
]

const PRESET_KEY = 'sharescreen.share.preset'
const AUDIO_KEY = 'sharescreen.share.audio'

function readPreset(): StreamQualityPreset {
  try {
    const value = localStorage.getItem(PRESET_KEY)
    if (value === 'detail' || value === 'balanced' || value === 'motion' || value === 'fluid') {
      return value
    }
  } catch {
    /* padrão */
  }
  return 'balanced'
}

function readAudio(): boolean {
  try {
    return localStorage.getItem(AUDIO_KEY) !== '0'
  } catch {
    return true
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignora */
  }
}

/** Seletor de tela: Telas ou Aplicativos (guias de navegador não existem aqui). */
export function Picker() {
  const t = useT()
  const [sources, setSources] = useState<ShareSource[] | null>(null)
  const [audioSupported, setAudioSupported] = useState(false)
  const [tab, setTab] = useState<ShareKind>('screen')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preset, setPreset] = useState<StreamQualityPreset>(readPreset)
  const [audio, setAudio] = useState(readAudio)

  // Lista e atualiza as miniaturas enquanto o seletor está aberto.
  useEffect(() => {
    let alive = true
    const load = () =>
      window.platform.share
        .listSources()
        .then((list) => {
          if (!alive) return
          setSources(list.sources)
          setAudioSupported(list.audioSupported)
        })
        .catch(console.error)
    void load()
    const timer = setInterval(load, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const visible = useMemo(() => (sources ?? []).filter((s) => s.kind === tab), [sources, tab])
  const selected = sources?.find((s) => s.id === selectedId) ?? null
  const counts = {
    screen: sources?.filter((s) => s.kind === 'screen').length ?? 0,
    window: sources?.filter((s) => s.kind === 'window').length ?? 0,
  }

  const start = useCallback(
    (source: ShareSource | null) => {
      if (!source) return
      remember(PRESET_KEY, preset)
      remember(AUDIO_KEY, audio ? '1' : '0')
      window.platform.share.select({
        sourceId: source.id,
        sourceName: source.name,
        kind: source.kind,
        preset,
        audio: audio && audioSupported,
      })
    },
    [preset, audio, audioSupported],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.platform.share.cancel()
      if (event.key === 'Enter') start(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, start])

  const audioHint = !audioSupported
    ? t('share.audio.windowsOnly')
    : tab === 'screen'
      ? t('picker.audioScreen')
      : t('picker.audioApp')

  return (
    <div className="picker-frame">
      <section className="picker app-backdrop" aria-label={t('picker.title')}>
        <header className="picker__head">
          <h1 className="picker__title">{t('picker.title')}</h1>
          <button
            type="button"
            className="picker__close"
            aria-label={t('common.cancel')}
            title={t('picker.cancelEsc')}
            onClick={() => window.platform.share.cancel()}
          >
            <X size={18} />
          </button>
        </header>

        <div className="picker__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'screen'}
            className="picker__tab"
            onClick={() => setTab('screen')}
          >
            <Monitor size={16} /> {t('picker.screens')}{' '}
            <span className="picker__count">{counts.screen}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'window'}
            className="picker__tab"
            onClick={() => setTab('window')}
          >
            <AppWindow size={16} /> {t('picker.apps')}{' '}
            <span className="picker__count">{counts.window}</span>
          </button>
        </div>

        <div
          className="picker__grid"
          role="listbox"
          aria-label={tab === 'screen' ? t('picker.screens') : t('picker.apps')}
        >
          {sources === null && <p className="picker__empty">{t('picker.searching')}</p>}
          {sources !== null && visible.length === 0 && (
            <p className="picker__empty">
              {tab === 'screen' ? t('picker.noScreens') : t('picker.noApps')}
            </p>
          )}
          {visible.map((source) => (
            <button
              key={source.id}
              type="button"
              role="option"
              aria-selected={source.id === selectedId}
              className="source"
              onClick={() => setSelectedId(source.id)}
              onDoubleClick={() => start(source)}
            >
              <span className="source__thumb">
                <img src={source.thumbnail} alt="" draggable={false} />
              </span>
              <span className="source__label">
                {source.icon ? (
                  <img className="source__icon" src={source.icon} alt="" draggable={false} />
                ) : source.kind === 'screen' ? (
                  <Monitor size={14} />
                ) : (
                  <AppWindow size={14} />
                )}
                <span className="source__name">{source.name}</span>
              </span>
            </button>
          ))}
        </div>

        <footer className="picker__foot">
          <div className="quality" role="radiogroup" aria-label={t('picker.quality')}>
            {presetOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={preset === option.id}
                className="quality__option"
                title={option.title ? t(option.title) : undefined}
                onClick={() => setPreset(option.id)}
              >
                <span className="quality__label">{t(`preset.${option.id}`)}</span>
                <span className="quality__detail">{option.detail}</span>
              </button>
            ))}
          </div>

          <div className="picker__actions">
            <label className="sound" title={audioHint}>
              <button
                type="button"
                role="switch"
                aria-checked={audio && audioSupported}
                aria-label={t('picker.audio')}
                className="switch"
                disabled={!audioSupported}
                onClick={() => setAudio((value) => !value)}
              />
              <span>
                <span className="sound__label">{t('picker.audio')}</span>
                <span className="sound__hint">{audioHint}</span>
              </span>
            </label>
            <button type="button" className="action" onClick={() => window.platform.share.cancel()}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="action action--primary"
              disabled={!selected}
              onClick={() => start(selected)}
            >
              {t('picker.start')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
