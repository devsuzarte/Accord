import type { ChatMessage, ChatMode, ChatState } from '@sharescreen/shared'
import { Avatar, colorFor, useReportSize } from '@sharescreen/ui'
import { useEffect, useState } from 'react'
import { useT } from '../shared/i18n'
import { ChatApp } from './full/ChatApp'

const empty: ChatState = {
  messages: [],
  access: null,
  channelName: null,
  identity: null,
  emojis: [],
  gifs: { provider: null },
}

/** Modo mínimo: até 6 mensagens, cada uma some 2 min depois de chegar. */
const MINI_COUNT = 6
const MINI_TTL = 2 * 60 * 1000

function useChat(): { state: ChatState; mode: ChatMode } {
  const [state, setState] = useState<ChatState>(empty)
  const [mode, setMode] = useState<ChatMode>('mini')
  useEffect(() => {
    window.platform.chat.getState().then(setState).catch(console.error)
    window.platform.chat.getMode().then(setMode).catch(console.error)
    const offState = window.platform.chat.onState(setState)
    const offMode = window.platform.chat.onMode(setMode)
    return () => {
      offState()
      offMode()
    }
  }, [])
  return { state, mode }
}

export function Chat() {
  const { state, mode } = useChat()
  return mode === 'expanded' ? <ChatApp state={state} /> : <MiniChat state={state} />
}

function avatarUrl(state: ChatState, message: ChatMessage): string | null {
  return message.avatar && state.access ? `${state.access.serverUrl}${message.avatar}` : null
}

// ───────────────────────── Mínimo (estilo chat de live) ─────────────────────────

function MiniChat({ state }: { state: ChatState }) {
  const t = useT()
  const frameRef = useReportSize<HTMLDivElement>((size) => window.platform.chat.resize(size))
  const [now, setNow] = useState(() => Date.now())

  // Recalcula de tempos em tempos para as mensagens antigas saírem.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  const visible = state.messages.filter((m) => now - m.at < MINI_TTL).slice(-MINI_COUNT)

  return (
    <div ref={frameRef} className="surface-frame mini-frame">
      {visible.length > 0 && (
        <ol className="mini" aria-live="polite">
          {visible.map((message) => {
            const left = MINI_TTL - (now - message.at)
            const hasImage = message.attachments.some((a) => a.image)
            return (
              <li key={message.id} className="mini__msg" data-leaving={left < 10_000 || undefined}>
                <Avatar
                  id={message.identity}
                  name={message.name}
                  src={avatarUrl(state, message)}
                  size={22}
                />
                <p className="mini__line">
                  <span
                    className="mini__name"
                    style={{ color: `color-mix(in srgb, ${colorFor(message.name)} 65%, white)` }}
                  >
                    {message.name}
                  </span>{' '}
                  {message.text && <span className="mini__text">{message.text}</span>}
                  {message.gif && !message.text && <span className="mini__hint">GIF</span>}
                  {message.attachments.length > 0 && (
                    <span className="mini__hint">
                      {' '}
                      {hasImage ? t('chat.imageInMini') : t('chat.fileInMini')}
                    </span>
                  )}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
