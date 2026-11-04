import type { CallSnapshot } from '@sharescreen/shared'
import { Check, Link2 } from 'lucide-react'
import { useState } from 'react'
import { useT } from './i18n'
import { inviteForCall } from './invites'

/** Copia o link de convite da chamada atual (com a senha, se o canal tiver). */
export function CopyInviteButton({
  server,
  className,
  compact = false,
}: {
  server: CallSnapshot['server']
  className: string
  compact?: boolean
}) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'copied' | 'missing'>('idle')
  if (!server) return null
  const label =
    state === 'copied'
      ? t('invite.copied')
      : state === 'missing'
        ? t('invite.noAddress')
        : t('invite.copy')

  const copy = async () => {
    const link = await inviteForCall(server)
    if (!link) {
      setState('missing')
    } else {
      await navigator.clipboard.writeText(link)
      setState('copied')
    }
    setTimeout(() => setState('idle'), state === 'missing' ? 4000 : 1500)
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={compact ? label : t('invite.hint')}
      onClick={(event) => {
        event.stopPropagation()
        void copy()
      }}
    >
      {state === 'copied' ? <Check size={compact ? 15 : 16} /> : <Link2 size={compact ? 15 : 16} />}
      {!compact && label}
    </button>
  )
}
