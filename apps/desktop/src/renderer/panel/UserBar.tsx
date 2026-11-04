import type { CallSnapshot, Profile } from '@sharescreen/shared'
import { Avatar, IconButton } from '@sharescreen/ui'
import { HeadphoneOff, Headphones, Mic, MicOff } from 'lucide-react'
import { channelLabel, useT } from '../shared/i18n'

/**
 * Barra fixa no rodapé do painel (como a do Discord): você, onde está, e os botões de
 * microfone e fone — funcionam antes de entrar (você já entra mudo/ensurdecido) e durante.
 */
export function UserBar({ call, profile }: { call: CallSnapshot; profile: Profile | null }) {
  const t = useT()
  const me = call.participants.find((p) => p.isLocal)
  const displayName = me?.displayName || profile?.name || t('userbar.you')
  const { micMuted, deafened } = call.audio

  const status =
    call.status === 'connected'
      ? t('userbar.inChannel', { name: channelLabel('geral', call.channelName ?? '') })
      : call.status === 'connecting'
        ? t('userbar.connecting')
        : call.status === 'reconnecting'
          ? t('userbar.reconnecting')
          : t('userbar.idle')

  return (
    <footer className="userbar">
      <button
        type="button"
        className="userbar__profile"
        title={t('pill.editProfile')}
        onClick={() => window.platform.panel.toggle('you')}
      >
        <Avatar
          id={me?.userId ?? 'local'}
          name={displayName}
          src={profile?.avatar ?? me?.avatarUrl}
          size={32}
          speaking={me?.speaking}
        />
        <span className="userbar__who">
          <span className="userbar__name">{displayName}</span>
          <span className="userbar__status" data-state={call.status}>
            {status}
          </span>
        </span>
      </button>
      <IconButton
        size="sm"
        label={micMuted ? t('pill.micOn') : t('pill.micMute')}
        tone={micMuted ? 'alert' : 'default'}
        icon={micMuted ? <MicOff size={16} /> : <Mic size={16} />}
        onClick={() => window.platform.call.command({ type: 'toggle-mic' })}
      />
      <IconButton
        size="sm"
        label={deafened ? t('pill.undeafen') : t('pill.deafen')}
        tone={deafened ? 'alert' : 'default'}
        icon={deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
        onClick={() => window.platform.call.command({ type: 'toggle-deafen' })}
      />
    </footer>
  )
}
