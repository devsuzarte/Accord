import { DEFAULT_SOUND_SETTINGS, SOUND_MAX_BYTES, SOUND_NAMES } from '@sharescreen/shared'
import type {
  MessageKey,
  SoundName,
  SoundPack,
  SoundSettings as Settings,
} from '@sharescreen/shared'
import { Play, RotateCcw, Upload, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../shared/i18n'
import { playSound } from '../shared/sounds'

const packs: SoundPack[] = ['accord', 'soft', 'arcade']

/** Volume base de cada ação (o mesmo que o pill usa ao tocar). */
const baseGain: Partial<Record<SoundName, number>> = {
  message: 0.09,
  'message-sent': 0.07,
  mention: 0.12,
  reaction: 0.08,
  'music-queued': 0.08,
  'ptt-down': 0.06,
  'ptt-up': 0.06,
}

function useSoundSettings(): [Settings, (next: Settings) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SOUND_SETTINGS)
  useEffect(() => {
    window.platform.sounds.get().then(setSettings).catch(console.error)
    return window.platform.sounds.onChange(setSettings)
  }, [])
  const save = (next: Settings) => {
    setSettings(next)
    window.platform.sounds.set(next)
  }
  return [settings, save]
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Sons do app: pacote (timbre), volume e, por ação, silenciar ou trocar por um som seu
 * (MP3, OGG, WAV… até 400 KB, os primeiros 4 s). Tudo fica só neste computador.
 */
export function SoundSettings({ enabled }: { enabled: boolean }) {
  const t = useT()
  const [settings, save] = useSoundSettings()
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [picking, setPicking] = useState<SoundName | null>(null)

  const preview = (name: SoundName, use = settings) =>
    playSound(name, baseGain[name] ?? 0.14, { ...use, muted: [] })

  const upload = async (file: File) => {
    if (!picking) return
    setError(null)
    if (file.size > SOUND_MAX_BYTES) return setError(t('sounds.err.tooLarge'))
    if (!file.type.startsWith('audio/')) return setError(t('sounds.err.type'))
    try {
      const data = await readAsDataUrl(file)
      const next = { ...settings, custom: { ...settings.custom, [picking]: data } }
      save(next)
      preview(picking, next)
    } catch {
      setError(t('sounds.err.type'))
    }
  }

  return (
    <div className="sounds" data-disabled={!enabled || undefined}>
      <div className="sounds__row">
        <span className="field__label">{t('sounds.pack')}</span>
        <div className="sounds__packs" role="radiogroup" aria-label={t('sounds.pack')}>
          {packs.map((pack) => (
            <button
              key={pack}
              type="button"
              role="radio"
              aria-checked={settings.pack === pack}
              disabled={!enabled}
              onClick={() => {
                const next = { ...settings, pack }
                save(next)
                preview('join', next)
              }}
            >
              {t(`sounds.pack.${pack}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
      <label className="sounds__row">
        <span className="field__label">
          <Volume2 size={14} /> {t('sounds.volume')}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          disabled={!enabled}
          aria-label={t('sounds.volume')}
          onChange={(e) => save({ ...settings, volume: Number(e.target.value) })}
          onPointerUp={() => preview('message')}
        />
      </label>

      <details className="band sounds__list">
        <summary className="band__summary">{t('sounds.customize')}</summary>
        <p className="field__hint">{t('sounds.customizeHint')}</p>
        <ul>
          {SOUND_NAMES.map((name) => {
            const muted = settings.muted.includes(name)
            const custom = !!settings.custom[name]
            return (
              <li key={name} className="sound" data-muted={muted || undefined}>
                <span className="sound__name">
                  {t(`sounds.name.${name}` as MessageKey)}
                  {custom && <span className="sound__tag">{t('sounds.custom')}</span>}
                </span>
                <button
                  type="button"
                  className="sound__button"
                  title={t('sounds.preview')}
                  aria-label={t('sounds.preview')}
                  disabled={!enabled}
                  onClick={() => preview(name)}
                >
                  <Play size={13} />
                </button>
                <button
                  type="button"
                  className="sound__button"
                  title={t('sounds.upload')}
                  aria-label={t('sounds.upload')}
                  disabled={!enabled}
                  onClick={() => {
                    setPicking(name)
                    fileRef.current?.click()
                  }}
                >
                  <Upload size={13} />
                </button>
                {custom && (
                  <button
                    type="button"
                    className="sound__button"
                    title={t('sounds.reset')}
                    aria-label={t('sounds.reset')}
                    onClick={() => {
                      const rest = Object.fromEntries(
                        Object.entries(settings.custom).filter(([key]) => key !== name),
                      )
                      save({ ...settings, custom: rest })
                    }}
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="sound__button"
                  aria-pressed={!muted}
                  title={muted ? t('sounds.unmute') : t('sounds.mute')}
                  aria-label={muted ? t('sounds.unmute') : t('sounds.mute')}
                  onClick={() =>
                    save({
                      ...settings,
                      muted: muted
                        ? settings.muted.filter((n) => n !== name)
                        : [...settings.muted, name],
                    })
                  }
                >
                  {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
              </li>
            )
          })}
        </ul>
        {error && <p className="notice notice--error">{error}</p>}
      </details>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
    </div>
  )
}
