import type { CallCommand, MessageKey, ParticipantState, Role } from '@sharescreen/shared'
import { Avatar, useReportSize } from '@sharescreen/ui'
import {
  Check,
  HeadphoneOff,
  Lock,
  MicOff,
  MonitorPlay,
  PenLine,
  ShieldCheck,
  Unplug,
  VolumeX,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { channelLabel, t as translate, useT } from '../shared/i18n'
import { CopyInviteButton } from '../shared/CopyInviteButton'
import { useCallSnapshot } from '../shared/useCallSnapshot'

const send = (command: CallCommand) => window.platform.call.command(command)

const roleLabel: Record<Role, MessageKey | null> = {
  owner: 'people.role.owner',
  admin: 'people.role.admin',
  member: null,
}

interface MenuState {
  person: ParticipantState
  x: number
  y: number
}

/**
 * Lista de pessoas da chamada. Clique direito (ou a tecla de menu) numa pessoa abre as
 * ações: mutar só para você, e — para o dono e os admins — para todos e desconectar.
 */
export function People() {
  const t = useT()
  const call = useCallSnapshot()
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** Altura mínima da janela enquanto o menu está aberto (para ele caber inteiro). */
  const [reserve, setReserve] = useState(0)
  const frameRef = useReportSize<HTMLDivElement>((size) => window.platform.people.resize(size))

  const me = call.participants.find((p) => p.isLocal)
  // Você aparece primeiro; o resto na ordem em que chegou.
  const people = [...call.participants].sort((a, b) => Number(b.isLocal) - Number(a.isLocal))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (menu) setMenu(null)
      else window.platform.people.close()
    }
    const onBlur = () => setMenu(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [menu])

  // A pessoa do menu saiu da chamada: fecha o menu.
  const menuPerson = menu && call.participants.find((p) => p.userId === menu.person.userId)

  const openMenu = (event: ReactMouseEvent, person: ParticipantState) => {
    event.preventDefault()
    const frame = frameRef.current?.getBoundingClientRect()
    const row = (event.currentTarget as HTMLElement).getBoundingClientRect()
    // Pela tecla de menu não há posição do mouse: abre embaixo da linha.
    const keyboard = event.clientX === 0 && event.clientY === 0
    setMenu({
      person,
      x: (keyboard ? row.left + 24 : event.clientX) - (frame?.left ?? 0),
      y: (keyboard ? row.bottom : event.clientY) - (frame?.top ?? 0),
    })
  }

  return (
    <div
      ref={frameRef}
      className="surface-frame people-frame"
      style={menu ? { minHeight: reserve } : undefined}
      onClick={() => setMenu(null)}
    >
      <section className="people material" aria-label={t('people.label')}>
        <header className="people__head">
          <span className="people__title">
            {t('people.title')}
            <span className="people__count">{call.participants.length}</span>
          </span>
          {call.channelName && (
            <span className="people__channel">{channelLabel('geral', call.channelName)}</span>
          )}
          <CopyInviteButton server={call.server} className="people__close people__invite" compact />
          <button
            type="button"
            className="people__close"
            aria-label={t('people.closeList')}
            title={t('common.closeEsc')}
            onClick={() => window.platform.people.close()}
          >
            <X size={16} />
          </button>
        </header>

        {people.length === 0 ? (
          <p className="people__empty">{t('people.empty')}</p>
        ) : (
          <ul className="people__list">
            {people.map((p) => (
              <PersonRow
                key={p.userId}
                person={p}
                active={menuPerson?.userId === p.userId}
                onMenu={(event) => openMenu(event, p)}
              />
            ))}
          </ul>
        )}

        {people.length > 0 && <p className="people__hint">{t('people.hint')}</p>}
      </section>

      {menu && menuPerson && me && (
        <PersonMenu
          person={menuPerson}
          me={me}
          x={menu.x}
          y={menu.y}
          onReserve={setReserve}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function PersonRow({
  person,
  active,
  onMenu,
}: {
  person: ParticipantState
  active: boolean
  onMenu: (event: ReactMouseEvent) => void
}) {
  const t = useT()
  const role = roleLabel[person.role]
  return (
    <li
      className="person"
      tabIndex={0}
      data-active={active || undefined}
      data-speaking={person.speaking || undefined}
      data-quiet={person.micMuted || person.deafened || person.localMicMuted || undefined}
      onContextMenu={onMenu}
      aria-haspopup="menu"
    >
      <Avatar
        id={person.userId}
        name={person.displayName}
        src={person.avatarUrl}
        size={30}
        speaking={person.speaking}
      />
      <span className="person__who">
        <span className="person__name">
          {person.displayName}
          {person.isLocal && <span className="person__you"> {t('common.you')}</span>}
        </span>
        {role && <span className="person__role">{t(role)}</span>}
      </span>
      <span className="person__status">
        {!person.isLocal && person.volume !== 1 && !person.localMicMuted && (
          <span
            className="person__volume"
            title={t('people.volumeBadge', { n: Math.round(person.volume * 100) })}
          >
            {Math.round(person.volume * 100)}%
          </span>
        )}
        {person.localMicMuted && (
          <VolumeX size={15} className="person__icon--local" aria-label={t('people.localMuted')} />
        )}
        {person.serverMicBlocked ? (
          <Lock size={14} aria-label={t('pill.micBlocked')} />
        ) : person.deafened ? (
          <HeadphoneOff size={15} aria-label={t('pill.deafened')} />
        ) : (
          person.micMuted && <MicOff size={15} aria-label={t('pill.micOff')} />
        )}
        {person.streaming &&
          (person.isLocal ? (
            <span className="live">{t('common.live')}</span>
          ) : (
            <button
              type="button"
              className="live live--watch"
              title={t('people.watch', { name: person.displayName })}
              onClick={(event) => {
                event.stopPropagation()
                send({ type: 'watch', identity: person.userId })
              }}
            >
              {t('common.live')}
            </button>
          ))}
      </span>
    </li>
  )
}

interface MenuItem {
  label: string
  hint?: string
  icon?: typeof Check
  checked?: boolean
  danger?: boolean
  run(): void
}

function itemsFor(person: ParticipantState, me: ParticipantState): MenuItem[][] {
  const t = translate
  if (person.isLocal) {
    return [
      [
        {
          label: t('menu.editProfile'),
          icon: PenLine,
          run: () => window.platform.panel.toggle('you'),
        },
      ],
    ]
  }
  const name = person.displayName
  const target = person.userId
  const groups: MenuItem[][] = []

  if (person.streaming) {
    groups.push([
      {
        label: t('menu.watch'),
        icon: MonitorPlay,
        run: () => send({ type: 'watch', identity: target }),
      },
    ])
  }

  groups.push([
    {
      label: t('menu.muteMicMe'),
      checked: person.localMicMuted,
      run: () => send({ type: 'local-mute', name, kind: 'mic', muted: !person.localMicMuted }),
    },
    {
      label: t('menu.muteAudioMe'),
      hint: t('menu.streamAudio'),
      checked: person.localAudioMuted,
      run: () => send({ type: 'local-mute', name, kind: 'audio', muted: !person.localAudioMuted }),
    },
  ])

  if (person.role === 'owner') return groups

  if (me.role === 'owner') {
    groups.push([
      {
        label: t('menu.muteMicAll'),
        checked: person.serverMicBlocked,
        run: () =>
          send({
            type: 'moderate',
            action: person.serverMicBlocked ? 'unmute-mic' : 'mute-mic',
            target,
          }),
      },
      {
        label: t('menu.muteAudioAll'),
        hint: t('menu.streamAudio'),
        checked: person.serverAudioBlocked,
        run: () =>
          send({
            type: 'moderate',
            action: person.serverAudioBlocked ? 'unmute-audio' : 'mute-audio',
            target,
          }),
      },
      {
        label: t('menu.admin'),
        hint: t('menu.adminHint'),
        icon: ShieldCheck,
        checked: person.role === 'admin',
        run: () =>
          send({
            type: 'moderate',
            action: person.role === 'admin' ? 'remove-admin' : 'make-admin',
            target,
          }),
      },
    ])
  }

  if (me.role === 'owner' || me.role === 'admin') {
    groups.push([
      {
        label: t('menu.disconnect'),
        icon: Unplug,
        danger: true,
        run: () => send({ type: 'moderate', action: 'kick', target }),
      },
    ])
  }
  return groups
}

function PersonMenu({
  person,
  me,
  x,
  y,
  onReserve,
  onClose,
}: {
  person: ParticipantState
  me: ParticipantState
  x: number
  y: number
  onReserve(height: number): void
  onClose(): void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const groups = itemsFor(person, me)

  // Cabe na largura da janela; se faltar altura, a janela cresce para caber o menu.
  useLayoutEffect(() => {
    const el = ref.current
    const frame = el?.parentElement
    if (!el || !frame) return
    const maxLeft = frame.offsetWidth - el.offsetWidth - 8
    el.style.left = `${Math.max(8, Math.min(x, maxLeft))}px`
    el.style.top = `${y}px`
    onReserve(y + el.offsetHeight + 16)
  }, [x, y, person.userId, onReserve])

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [person.userId])

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={t('menu.actionsFor', { name: person.displayName })}
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const buttons = [...(ref.current?.querySelectorAll('button') ?? [])]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1
        buttons[(next + buttons.length) % buttons.length]?.focus()
      }}
    >
      <p className="menu__title">{person.displayName}</p>
      {!person.isLocal && <VolumeSlider person={person} />}
      {groups.map((group, i) => (
        <div key={i} className="menu__group" role="group">
          {group.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={item.checked}
                className="menu__item"
                data-danger={item.danger || undefined}
                onClick={() => {
                  item.run()
                  onClose()
                }}
              >
                <span className="menu__text">
                  <span className="menu__label">{item.label}</span>
                  {item.hint && <span className="menu__hint">{item.hint}</span>}
                </span>
                {item.checked !== undefined ? (
                  <span className="menu__check" data-on={item.checked || undefined} aria-hidden>
                    {item.checked && <Check size={12} strokeWidth={3} />}
                  </span>
                ) : (
                  Icon && <Icon size={16} aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Volume da voz dessa pessoa só para você: 0% a 200%. */
function VolumeSlider({ person }: { person: ParticipantState }) {
  const t = useT()
  const [value, setValue] = useState(Math.round(person.volume * 100))
  const change = (percent: number) => {
    setValue(percent)
    send({ type: 'set-volume', name: person.displayName, volume: percent / 100 })
  }
  return (
    <div className="menu__volume">
      <span className="menu__volume-head">
        <span className="menu__label">{t('menu.volume')}</span>
        <button
          type="button"
          className="menu__volume-value"
          title={t('menu.volumeReset')}
          onClick={() => change(100)}
        >
          {value}%
        </button>
      </span>
      <input
        type="range"
        className="menu__slider"
        min={0}
        max={200}
        step={5}
        value={value}
        aria-label={t('menu.volume')}
        style={{ '--fill': `${value / 2}%` } as React.CSSProperties}
        onChange={(e) => change(Number(e.target.value))}
      />
    </div>
  )
}
