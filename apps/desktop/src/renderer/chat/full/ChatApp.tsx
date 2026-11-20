import type { ChatState, ChatView, MusicView, ParticipantState } from '@sharescreen/shared'
import { Avatar } from '@sharescreen/ui'
import {
  AudioLines,
  Hash,
  HeadphoneOff,
  Headphones,
  Lock,
  Mic,
  MicOff,
  MonitorPlay,
  Music,
  PhoneOff,
  Settings2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { channelLabel, useT } from '../../shared/i18n'
import { useCallSnapshot } from '../../shared/useCallSnapshot'
import logo from '../../shared/assets/logo.svg'
import { Conversation } from './Conversation'
import { MusicRoom } from './MusicRoom'
import type { LocalMusic } from './MusicRoom'

function useMusic(): { view: LocalMusic; playerOpen: boolean } {
  const [view, setView] = useState<LocalMusic>({
    state: null,
    access: null,
    identity: null,
    receivedAt: 0,
  })
  const [playerOpen, setPlayerOpen] = useState(false)
  useEffect(() => {
    const receive = (next: MusicView) => setView({ ...next, receivedAt: Date.now() })
    window.platform.music.getState().then(receive).catch(console.error)
    window.platform.music.playerOpen().then(setPlayerOpen).catch(console.error)
    const off1 = window.platform.music.onState(receive)
    const off2 = window.platform.music.onPlayer(setPlayerOpen)
    return () => {
      off1()
      off2()
    }
  }, [])
  return { view, playerOpen }
}

/**
 * Janela de chat completa, no espírito do Discord: lateral com o canal e quem está na call,
 * conversa no centro (coluna de leitura confortável, campo grande embaixo) e a sala de música.
 */
export function ChatApp({ state }: { state: ChatState }) {
  const t = useT()
  const call = useCallSnapshot()
  const { view: music, playerOpen } = useMusic()
  const [view, setView] = useState<ChatView>('chat')

  useEffect(() => {
    // A página é a mesma do modo mínimo (transparente): aqui ela ocupa a janela inteira.
    document.documentElement.dataset.window = 'full'
    window.platform.chat.getView().then(setView).catch(console.error)
    return window.platform.chat.onView(setView)
  }, [])

  const access = state.access
  const people = call.participants
  const me = people.find((p) => p.isLocal) ?? null
  const channel = channelLabel('geral', state.channelName ?? '')
  const playing = music.state?.current ?? null

  if (!access) {
    return (
      <div className="app app--empty">
        <div className="titlebar" />
        <p className="app__offline">{t('chat.offline')}</p>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="side" aria-label={t('chat.side')}>
        <div className="side__brand titlebar">
          <img src={logo} alt="" className="side__logo" draggable={false} />
          <span className="side__server">
            <span className="side__name">{channel}</span>
            <span className="side__note">{t('chat.temporary')}</span>
          </span>
        </div>

        <nav className="side__nav" aria-label={t('chat.areas')}>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'chat' ? 'page' : undefined}
            onClick={() => setView('chat')}
          >
            <Hash size={18} aria-hidden />
            <span>{t('chat.navChat')}</span>
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'music' ? 'page' : undefined}
            onClick={() => setView('music')}
          >
            <Music size={18} aria-hidden />
            <span>{t('music.title')}</span>
            {playing && playing.pausedAt === null && (
              <AudioLines size={15} className="nav-item__live" aria-label={t('music.nowPlaying')} />
            )}
          </button>
        </nav>

        <section className="side__people" aria-label={t('chat.inCall', { n: people.length })}>
          <h2 className="side__heading">{t('chat.inCall', { n: people.length })}</h2>
          <ul>
            {people.map((person) => (
              <PersonRow key={person.userId} person={person} />
            ))}
          </ul>
        </section>

        {playing && view !== 'music' && (
          <button type="button" className="side__playing" onClick={() => setView('music')}>
            <img src={playing.thumbnail} alt="" />
            <span>
              <span className="side__playing-label">
                {playing.pausedAt !== null ? t('music.paused') : t('music.nowPlaying')}
              </span>
              <span className="side__playing-title">{playing.title}</span>
            </span>
          </button>
        )}

        {me && <UserBar me={me} />}
      </aside>

      <main className="main">
        <header className="main__bar titlebar">
          {view === 'chat' ? <Hash size={20} aria-hidden /> : <Music size={20} aria-hidden />}
          <h1 className="main__title">{view === 'chat' ? t('chat.navChat') : t('music.title')}</h1>
          <span className="main__divider" aria-hidden />
          <span className="main__topic">
            {view === 'chat' ? t('chat.topic') : t('music.topic')}
          </span>
        </header>
        {view === 'chat' ? (
          <Conversation state={state} access={access} people={people} me={me} />
        ) : (
          <MusicRoom view={music} access={access} me={me} playerOpen={playerOpen} />
        )}
      </main>
    </div>
  )
}

/** Pessoa na call. Quem está transmitindo: clicar na linha já abre a transmissão. */
function PersonRow({ person }: { person: ParticipantState }) {
  const t = useT()
  const watchable = person.streaming && !person.isLocal
  const content = (
    <>
      <Avatar
        id={person.userId}
        name={person.displayName}
        src={person.avatarUrl}
        size={32}
        speaking={person.speaking}
      />
      <span className="person__name">
        {person.displayName}
        {person.isLocal && <span className="person__you"> {t('common.you')}</span>}
      </span>
      <span className="person__icons">
        {person.serverMicBlocked ? (
          <Lock size={14} aria-label={t('pill.micBlocked')} />
        ) : person.deafened ? (
          <HeadphoneOff size={14} aria-label={t('pill.deafened')} />
        ) : (
          person.micMuted && <MicOff size={14} aria-label={t('pill.micOff')} />
        )}
        {person.streaming && <span className="live">{t('common.live')}</span>}
      </span>
    </>
  )
  return (
    <li>
      {watchable ? (
        <button
          type="button"
          className="person"
          data-speaking={person.speaking || undefined}
          title={t('people.watch', { name: person.displayName })}
          onClick={() => window.platform.call.command({ type: 'watch', identity: person.userId })}
        >
          {content}
          <MonitorPlay size={15} className="person__watch" aria-hidden />
        </button>
      ) : (
        <div className="person" data-speaking={person.speaking || undefined}>
          {content}
        </div>
      )}
    </li>
  )
}

function UserBar({ me }: { me: ParticipantState }) {
  const t = useT()
  const send = window.platform.call.command
  return (
    <div className="userbar">
      <Avatar
        id={me.userId}
        name={me.displayName}
        src={me.avatarUrl}
        size={34}
        speaking={me.speaking}
      />
      <span className="userbar__who">
        <span className="userbar__name">{me.displayName}</span>
        <span className="userbar__status">
          {me.streaming ? t('chat.youLive') : t('chat.youInCall')}
        </span>
      </span>
      <button
        type="button"
        className="userbar__button"
        data-off={me.micMuted || undefined}
        disabled={me.serverMicBlocked}
        aria-label={me.micMuted ? t('pill.micOn') : t('pill.micMute')}
        title={me.micMuted ? t('pill.micOn') : t('pill.micMute')}
        onClick={() => send({ type: 'toggle-mic' })}
      >
        {me.micMuted ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      <button
        type="button"
        className="userbar__button"
        data-off={me.deafened || undefined}
        aria-label={me.deafened ? t('pill.undeafen') : t('pill.deafen')}
        title={me.deafened ? t('pill.undeafen') : t('pill.deafen')}
        onClick={() => send({ type: 'toggle-deafen' })}
      >
        {me.deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
      </button>
      <button
        type="button"
        className="userbar__button"
        aria-label={t('pill.settings')}
        title={t('pill.settings')}
        onClick={() => window.platform.panel.toggle('you')}
      >
        <Settings2 size={18} />
      </button>
      <button
        type="button"
        className="userbar__button userbar__button--danger"
        aria-label={t('pill.leave')}
        title={t('pill.leave')}
        onClick={() => send({ type: 'leave' })}
      >
        <PhoneOff size={18} />
      </button>
    </div>
  )
}
