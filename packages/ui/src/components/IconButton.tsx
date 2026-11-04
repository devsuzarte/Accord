import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './IconButton.css'

/** Botão redondo de ícone. Rótulo acessível obrigatório (vira tooltip nativo). */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: ReactNode
  /** default: neutro · on: ligado (marca) · alert: estado de atenção (mudo, ao vivo) · danger: ação destrutiva */
  tone?: 'default' | 'on' | 'alert' | 'danger'
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  icon,
  tone = 'default',
  size = 'md',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className="ss-icon-button"
      data-tone={tone}
      data-size={size}
      aria-label={label}
      title={label}
      {...rest}
    >
      {icon}
    </button>
  )
}
