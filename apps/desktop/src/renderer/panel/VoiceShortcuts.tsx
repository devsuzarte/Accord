import { bindingFromKeyboard, bindingFromModifier, bindingFromMouse } from '@sharescreen/shared'
import type { BindingId, KeyBinding, VoiceHotkeys } from '@sharescreen/shared'
import { Keyboard, Mic, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../shared/i18n'

const rows: BindingId[] = ['mute', 'deafen', 'ptt', 'unlockMini']

/**
 * Atalhos que a pessoa escolhe: mutar, ensurdecer, aperte-para-falar e destravar a miniatura.
 * No Windows aceitam botões laterais do mouse e funcionam com o jogo em foco sem "roubar" a tecla.
 */
export function VoiceShortcuts() {
  const t = useT()
  const [hotkeys, setHotkeys] = useState<VoiceHotkeys | null>(null)
  const [capturing, setCapturing] = useState<BindingId | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    window.platform.hotkeys.voice().then(setHotkeys).catch(console.error)
    return window.platform.hotkeys.onVoiceChange(setHotkeys)
  }, [])

  // Escolhendo um atalho: a próxima tecla (ou botão do mouse) apertada vira o atalho.
  useEffect(() => {
    if (!capturing || !hotkeys) return
    window.platform.hotkeys.capturing(true)
    let modifier: string | null = null
    const save = (binding: KeyBinding) => {
      if (!hotkeys.holdSupported && !binding.accelerator) {
        setHint(t('keys.err.onlyWindows'))
        return
      }
      setHint(null)
      setCapturing(null)
      void window.platform.hotkeys
        .setVoice({ bindings: { ...hotkeys.bindings, [capturing]: binding } })
        .then(setHotkeys)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape') return setCapturing(null)
      if (/^(Control|Shift|Alt|Meta)/.test(event.code)) {
        modifier = event.code
        return
      }
      modifier = null
      const binding = bindingFromKeyboard(event)
      if (binding) save(binding)
      else setHint(t('keys.err.unsupported'))
    }
    // Só um Ctrl/Shift/Alt, apertado e solto sozinho (comum no aperte-para-falar).
    const onKeyUp = (event: KeyboardEvent) => {
      if (modifier && event.code === modifier) {
        const binding = bindingFromModifier(modifier)
        if (binding) save(binding)
      }
      modifier = null
    }
    const onMouse = (event: MouseEvent) => {
      const binding = bindingFromMouse(event.button)
      if (!binding) return
      event.preventDefault()
      save(binding)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('mousedown', onMouse, true)
    // O botão "voltar" do mouse não pode navegar a página.
    const stopAux = (event: MouseEvent) => event.preventDefault()
    window.addEventListener('auxclick', stopAux, true)
    window.addEventListener('mouseup', stopAux, true)
    return () => {
      window.platform.hotkeys.capturing(false)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('auxclick', stopAux, true)
      window.removeEventListener('mouseup', stopAux, true)
    }
  }, [capturing, hotkeys, t])

  if (!hotkeys) return null
  const ptt = hotkeys.voiceMode === 'ptt'

  const setMode = (mode: VoiceHotkeys['voiceMode']) => {
    if (mode === 'ptt' && !hotkeys.bindings.ptt) {
      setHint(t('keys.pttPickFirst'))
      setCapturing('ptt')
      return
    }
    void window.platform.hotkeys.setVoice({ voiceMode: mode }).then(setHotkeys)
  }

  return (
    <div className="stack">
      <div>
        <p className="row__title">
          <Mic size={15} /> {t('keys.voiceMode')}
        </p>
        <div
          className="segments segments--spaced"
          role="radiogroup"
          aria-label={t('keys.voiceMode')}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!ptt}
            className="segments__item"
            onClick={() => setMode('voice')}
          >
            {t('keys.voiceActivity')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={ptt}
            className="segments__item"
            disabled={!hotkeys.holdSupported}
            onClick={() => setMode('ptt')}
          >
            {t('keys.pushToTalk')}
          </button>
        </div>
        <p className="row__text">
          {!hotkeys.holdSupported
            ? t('keys.pttOnlyWindows')
            : ptt
              ? t('keys.pttOn', { key: hotkeys.bindings.ptt?.label ?? '—' })
              : t('keys.voiceActivityText')}
        </p>
      </div>

      {ptt && (
        <label className="field">
          <span className="field__label">{t('keys.release', { ms: hotkeys.pttReleaseMs })}</span>
          <input
            type="range"
            min={0}
            max={1000}
            step={50}
            value={hotkeys.pttReleaseMs}
            onChange={(e) =>
              void window.platform.hotkeys
                .setVoice({ pttReleaseMs: Number(e.target.value) })
                .then(setHotkeys)
            }
          />
        </label>
      )}

      <ul className="keys">
        {rows.map((id) => {
          const binding = hotkeys.bindings[id]
          const waiting = capturing === id
          return (
            <li key={id} className="keys__item keys__item--edit">
              <span>{t(`keys.${id}`)}</span>
              <button
                type="button"
                className="keys__pick"
                data-waiting={waiting || undefined}
                onClick={() => setCapturing(waiting ? null : id)}
                aria-label={t('keys.change', { action: t(`keys.${id}`) })}
              >
                {waiting ? (
                  t('keys.press')
                ) : binding ? (
                  <kbd>{binding.label}</kbd>
                ) : (
                  <span className="keys__none">
                    <Keyboard size={13} aria-hidden /> {t('keys.none')}
                  </span>
                )}
              </button>
              {binding && !waiting && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('keys.remove', { action: t(`keys.${id}`) })}
                  title={t('keys.remove', { action: t(`keys.${id}`) })}
                  onClick={() =>
                    void window.platform.hotkeys
                      .setVoice({ bindings: { ...hotkeys.bindings, [id]: null } })
                      .then(setHotkeys)
                  }
                >
                  <X size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {hint && <p className="notice notice--warn">{hint}</p>}
      {capturing && <p className="hint hint--flush">{t('keys.pressHint')}</p>}
    </div>
  )
}
