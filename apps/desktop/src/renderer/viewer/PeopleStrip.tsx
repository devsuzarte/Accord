import type { ParticipantState } from '@sharescreen/shared'
import { Avatar, colorFor } from '@sharescreen/ui'
import { HeadphoneOff, Lock, MicOff, MonitorPlay, PauseCircle } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useT } from '../shared/i18n'

const STRIP_KEY = 'sharescreen.viewer.strip'

export function readStripOpen(): boolean {
  try {
    return localStorage.getItem(STRIP_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveStripOpen(open: boolean): void {
  try {
    localStorage.setItem(STRIP_KEY, open ? '1' : '0')
  } catch {
    /* ignora */
  }
}

/** Fundo do cartão: a própria foto (ou GIF), desfocada; sem foto, a cor da pessoa. */
function backdrop(person: { displayName: string; avatarUrl: string | null }): CSSProperties {
  const color = colorFor(person.displayName)
  return {
    ['--tile-color' as string]: color,
    ['--tile-image' as string]: person.avatarUrl ? `url("${person.avatarUrl}")` : 'none',
  }
}

/**
 * Faixa embaixo da transmissão, como no Discord: um cartão por pessoa da call, com a foto
 * (GIF animado também) sobre um fundo feito dela mesma. Quem fala ganha o anel verde; quem
 * transmite ganha o selo AO VIVO e um clique abre a transmissão dela. Dá para esconder.
 */
export function PeopleStrip({
  people,
  watching,
}: {
  people: ParticipantState[]
  watching: string | null
}) {
  const t = useT()
  return (
    <ul className="strip" aria-label={t('viewer.strip.label')}>
      {people.map((person) => {
        const current = person.userId === watching
        const canWatch = person.streaming && !person.isLocal && !current
        const body = (
          <>
            <span className="tile__avatar">
              <Avatar
                id={person.userId}
                name={person.displayName}
                src={person.avatarUrl}
                size={52}
                speaking={person.speaking}
              />
            </span>
            <span className="tile__name">
              {person.serverMicBlocked ? (
                <Lock size={12} aria-label={t('pill.micBlocked')} />
              ) : person.deafened ? (
                <HeadphoneOff size={12} aria-label={t('pill.deafened')} />
              ) : (
                person.micMuted && <MicOff size={12} aria-label={t('pill.micOff')} />
              )}
              <span>
                {person.displayName}
                {person.isLocal && ` ${t('common.you')}`}
              </span>
            </span>
            {person.streaming && (
              <span className="tile__live">
                {current ? t('viewer.strip.watching') : t('common.live')}
              </span>
            )}
            {canWatch && <MonitorPlay size={16} className="tile__watch" aria-hidden />}
          </>
        )
        return (
          <li key={person.userId}>
            {canWatch ? (
              <button
                type="button"
                className="tile"
                data-speaking={person.speaking || undefined}
                style={backdrop(person)}
                title={t('people.watch', { name: person.displayName })}
                onClick={() =>
                  window.platform.call.command({ type: 'watch', identity: person.userId })
                }
              >
                {body}
              </button>
            ) : (
              <div
                className="tile"
                data-speaking={person.speaking || undefined}
                data-current={current || undefined}
                style={backdrop(person)}
              >
                {body}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Tela de espera quando a pessoa ainda não começou, parou de transmitir ou saiu da call.
 * A janela não fecha: a transmissão volta sozinha aqui quando ela recomeçar.
 */
export function StreamerCard({
  person,
  name,
  phase,
  compact,
  camera = false,
}: {
  person: ParticipantState | null
  name: string
  phase: 'paused' | 'left' | 'waiting'
  compact: boolean
  /** Janela de câmera (não de tela): os textos falam da câmera. */
  camera?: boolean
}) {
  const t = useT()
  const look = { displayName: person?.displayName ?? name, avatarUrl: person?.avatarUrl ?? null }
  return (
    <div
      className="waiting"
      style={backdrop(look)}
      data-compact={compact || undefined}
      role="status"
    >
      <span className="waiting__avatar">
        <Avatar
          id={person?.userId ?? name}
          name={look.displayName}
          src={look.avatarUrl}
          size={compact ? 56 : 112}
          speaking={person?.speaking ?? false}
        />
      </span>
      <p className="waiting__title">
        {phase === 'paused' && (
          <>
            <PauseCircle size={18} aria-hidden />
            {camera ? t('viewer.cameraOff', { name }) : t('viewer.paused', { name })}
          </>
        )}
        {phase === 'left' && t('viewer.left', { name })}
        {phase === 'waiting' &&
          (camera ? t('viewer.cameraOff', { name }) : t('viewer.notStreaming', { name }))}
      </p>
      {!compact && (
        <p className="waiting__text">
          {phase === 'left' ? t('viewer.leftHint') : t('viewer.pausedHint')}
        </p>
      )}
      {!compact && (
        <button type="button" className="viewer__pill" onClick={() => window.close()}>
          {t('viewer.close')}
        </button>
      )}
    </div>
  )
}
