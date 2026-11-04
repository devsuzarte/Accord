import {
  DEFAULT_THEME,
  MAX_BACKGROUND_OPACITY,
  THEME_COLOR_KEYS,
  THEME_PRESETS,
} from '@sharescreen/shared'
import type { MessageKey, Theme, ThemeColors } from '@sharescreen/shared'
import { ImagePlus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IMAGE_ACCEPT, prepareImage } from '../shared/images'
import { useT } from '../shared/i18n'
import { applyTheme } from '../shared/theme'
import { openFilePicker } from '../shared/filePicker'

/**
 * Aba Aparência: paletas prontas, as 8 cores do app e uma imagem de fundo (aceita GIF)
 * com opacidade baixa. Muda na hora em todas as janelas.
 */
export function AppearanceTab() {
  const t = useT()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.platform.theme.get().then(setTheme).catch(console.error)
    return window.platform.theme.onChange(setTheme)
  }, [])

  if (!theme) return null

  /** Aplica já nesta janela; grava (e avisa as outras) logo depois — o seletor de cor dispara muito. */
  const update = (next: Theme, immediate = false) => {
    setTheme(next)
    applyTheme(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (immediate) window.platform.theme.set(next)
    else saveTimer.current = setTimeout(() => window.platform.theme.set(next), 180)
  }

  const setColor = (key: keyof ThemeColors, value: string) =>
    update({ ...theme, preset: 'custom', colors: { ...theme.colors, [key]: value } })

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const backgroundImage = await prepareImage(file, { maxSide: 1600 })
      update({ ...theme, backgroundImage }, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile.photoError'))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="stack stack--loose">
      <div>
        <p className="row__title">{t('look.palettes')}</p>
        <div className="palettes" role="radiogroup" aria-label={t('look.palettesLabel')}>
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={theme.preset === preset.id}
              className="palette"
              style={{ background: preset.colors.background, color: preset.colors.text }}
              onClick={() => update({ ...theme, preset: preset.id, colors: preset.colors }, true)}
            >
              <span className="palette__dots" aria-hidden>
                {[preset.colors.surface, preset.colors.accent, preset.colors.speaking].map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="palette__name">{t(`palette.${preset.id}` as MessageKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="row__title">
          {t('look.colors')}
          {theme.preset === 'custom' && <span className="tag">{t('look.custom')}</span>}
        </p>
        <div className="colors">
          {THEME_COLOR_KEYS.map((key) => (
            <label key={key} className="color">
              <input
                type="color"
                className="color__input"
                value={theme.colors[key]}
                onChange={(e) => setColor(key, e.target.value)}
              />
              <span className="color__text">
                <span className="color__label">{t(`color.${key}`)}</span>
                <span className="color__hex">{theme.colors[key].toUpperCase()}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="row__title">{t('look.bg')}</p>
        <p className="row__text">{t('look.bgText')}</p>
        <div className="backdrop">
          <button
            type="button"
            className="backdrop__preview"
            style={{
              backgroundColor: theme.colors.background,
              backgroundImage: theme.backgroundImage
                ? `url("${theme.backgroundImage}")`
                : undefined,
            }}
            onClick={() => openFilePicker(fileRef.current)}
            aria-label={theme.backgroundImage ? t('look.bgChangeLabel') : t('look.bgChooseLabel')}
          >
            {!theme.backgroundImage && <ImagePlus size={20} aria-hidden />}
          </button>
          <div className="backdrop__actions">
            <button
              type="button"
              className="action action--small"
              onClick={() => openFilePicker(fileRef.current)}
            >
              {theme.backgroundImage ? t('look.bgChange') : t('look.bgChoose')}
            </button>
            {theme.backgroundImage && (
              <button
                type="button"
                className="action action--small action--quiet"
                onClick={() => update({ ...theme, backgroundImage: null }, true)}
              >
                <Trash2 size={14} /> {t('common.remove')}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => void pickImage(e.target.files?.[0])}
          />
        </div>
        {theme.backgroundImage && (
          <label className="field field--inline">
            <span className="field__label">{t('look.visibility')}</span>
            <input
              type="range"
              className="slider"
              min={0.04}
              max={MAX_BACKGROUND_OPACITY}
              step={0.01}
              value={theme.backgroundOpacity}
              onChange={(e) => update({ ...theme, backgroundOpacity: Number(e.target.value) })}
            />
            <span className="slider__value">{Math.round(theme.backgroundOpacity * 100)}%</span>
          </label>
        )}
        {error && <p className="notice notice--error">{error}</p>}
      </div>

      <button
        type="button"
        className="action action--quiet"
        onClick={() => update({ ...DEFAULT_THEME, backgroundImage: theme.backgroundImage }, true)}
      >
        <RotateCcw size={15} /> {t('look.reset')}
      </button>
    </div>
  )
}
