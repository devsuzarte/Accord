import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../shared/i18n'

/** Campo de senha com o botão de mostrar/esconder. */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength = 64,
}: {
  value: string
  onChange(value: string): void
  placeholder: string
  autoFocus?: boolean
  maxLength?: number
}) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  return (
    <span className="password">
      <KeyRound size={15} className="password__icon" aria-hidden />
      <input
        className="field__input password__input"
        type={visible ? 'text' : 'password'}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="icon-button password__toggle"
        aria-label={visible ? t('common.hide') : t('common.show')}
        title={visible ? t('common.hide') : t('common.show')}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </span>
  )
}
