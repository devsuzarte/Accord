import type { ParticipantState, ShareState } from '@sharescreen/shared'
import { Avatar, IconButton, useReportSize } from '@sharescreen/ui'
import {
  ChevronsLeft,
  ChevronsRight,
  Ghost,
  HeadphoneOff,
  Headphones,
  Loader,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Plus,
  Settings2,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { demoEnabled, demoParticipants } from '../shared/demo'
import { t as translateNow, useT } from '../shared/i18n'
import { useOverlayState } from '../shared/useOverlayState'
import { useCallStore } from './call/callStore'

type Mode = 'collapsed' | 'compact'

const MODE_KEY = 'sharescreen.pill.mode'

function readMode(): Mode {
  try {
    const value = localStorage.getItem(MODE_KEY)
    if (value === 'collapsed' || value === 'compact') return value
  } catch {
    /* armazenamento indisponível: usa o padrão */
  }
  return 'compact'
}

function writeMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignora */
  }
}

/** Controles que o pill precisa, venham da chamada real ou do modo de exemplo. */
interface CallView {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting'
  participants: ParticipantState[]
  sharing: ShareState | null
  /** Última mensagem de erro (some sozinha do pill depois de alguns segundos). */
  error: string | null
  toggleMic(): void
  toggleDeafen(): void
  toggleShare(): void
  openPeople(): void
  leave(): void
}

/** Modo de exemplo (VITE_OVERLAY_DEMO=1): participantes falsos com fala simulada. */
function useDemoCall(): CallView {
  const [participants, setParticipants] = useState<ParticipantState[]>(demoParticipants)

  useEffect(() => {
    if (!demoEnabled) return
    const script = ['demo-ana', null, 'me', 'demo-ana', null, 'demo-caio', null]
    let step = 0
    const timer = setInterval(() => {
      const speakerId = script[step % script.length]
      step += 1
      setParticipants((list) =>
        list.map((p) => ({ ...p, speaking: p.userId === speakerId && !p.micMuted && !p.deafened })),
      )
    }, 1400)
    return () => clearInterval(timer)
  }, [])

  const updateMe = (patch: (me: ParticipantState) => Partial<ParticipantState>) =>
    setParticipants((list) => list.map((p) => (p.isLocal ? { ...p, ...patch(p) } : p)))

  const me = participants.find((p) => p.isLocal)
  return {
    status: participants.length ? 'connected' : 'idle',
    participants,
    sharing: me?.streaming ? { sourceName: 'Tela de exemplo', kind: 'screen', audio: 'on' } : null,
    error: null,
    toggleMic: () => updateMe((me) => ({ micMuted: !me.micMuted })),
    toggleDeafen: () =>
      updateMe((me) => ({ deafened: !me.deafened, micMuted: !me.deafened || me.micMuted })),
    toggleShare: () => updateMe((me) => ({ streaming: !me.streaming })),
    openPeople: () => window.platform.people.toggle(),
    leave: () => setParticipants([]),
  }
}

function useRealCall(): CallView {
  const status = useCallStore((s) => s.status)
  const participants = useCallStore((s) => s.participants)
  const sharing = useCallStore((s) => s.sharing)
  const error = useCallStore((s) => s.error)
  const toggleMic = useCallStore((s) => s.toggleMic)
  const toggleDeafen = useCallStore((s) => s.toggleDeafen)
  const stopShare = useCallStore((s) => s.stopShare)
  const leave = useCallStore((s) => s.leave)
  return {
    status,
    participants,
    sharing,
    error,
    toggleMic: () => void toggleMic(),
    toggleDeafen: () => void toggleDeafen(),
    // Começar abre o seletor; a transmissão começa quando a escolha voltar do main.
    toggleShare: () => {
      if (sharing) void stopShare()
      else if (status !== 'connected') {
        useCallStore.setState({ error: translateNow('pill.waitConnection') })
      } else window.platform.share.openPicker()
    },
    openPeople: () => window.platform.people.toggle(),
    leave: () => void leave(),
  }
}

// Escolhido uma vez no carregamento: os hooks não mudam entre renders.
const useCall = demoEnabled ? useDemoCall : useRealCall

export function Pill() {
  const t = useT()
  const overlay = useOverlayState()
  const call = useCall()
  const [mode, setModeState] = useState<Mode>(readMode)
  const [dismissedError, setDismissedError] = useState<string | null>(null)

  // Erros (ex.: falha ao transmitir) aparecem no próprio pill por alguns segundos.
  useEffect(() => {
    if (!call.error) return
    const error = call.error
    const timer = setTimeout(() => setDismissedError(error), 7000)
    return () => clearTimeout(timer)
  }, [call.error])
  const notice = call.error && call.error !== dismissedError ? call.error : null

  const frameRef = useReportSize<HTMLDivElement>((size) => window.platform.overlay.resize(size))

  const setMode = (next: Mode) => {
    setModeState(next)
    writeMode(next)
  }

  const { participants } = call
  const inCall = participants.length > 0
  const me = participants.find((p) => p.isLocal)
  const others = participants.filter((p) => !p.isLocal)
  const someoneLive = others.some((p) => p.streaming)
  const anyoneSpeaking = participants.some((p) => p.speaking)
  const side = overlay.edges.horizontal === 'right' ? 'right' : 'left'
  // Fora da chamada não recolhe: o pill mostra direto o "Entrar num canal".
  const collapsed = inCall && mode === 'collapsed'
  const unstable = call.status === 'connecting' || call.status === 'reconnecting'

  const FoldIcon = (side === 'left') === collapsed ? ChevronsRight : ChevronsLeft

  return (
    <div ref={frameRef} className="surface-frame">
      <div
        className="pill material"
        data-side={side}
        data-mode={mode}
        data-ghost={overlay.ghost || undefined}
      >
        <div className="spine" title={t('pill.dragToMove')}>
          <span className="spine__grip" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          {inCall && (
            <span
              className="spine__count"
              aria-label={t('pill.inCall', { n: participants.length })}
            >
              {participants.length}
            </span>
          )}
          <span
            className="spine__voice"
            data-active={anyoneSpeaking || undefined}
            data-unstable={unstable || undefined}
            aria-hidden
          />
          {overlay.ghost && (
            <Ghost className="spine__ghost" size={14} aria-label={t('pill.ghost')} />
          )}
          {inCall && (
            <button
              type="button"
              className="spine__fold"
              aria-label={collapsed ? t('pill.open') : t('pill.collapse')}
              title={collapsed ? t('pill.openShort') : t('pill.collapseShort')}
              onClick={() => setMode(collapsed ? 'compact' : 'collapsed')}
            >
              <FoldIcon size={14} />
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="pill__body">
            {inCall && me ? (
              <>
                <button
                  type="button"
                  className="me"
                  data-speaking={me.speaking || undefined}
                  title={t('pill.editProfile')}
                  onClick={() => window.platform.panel.toggle('you')}
                >
                  <Avatar
                    id={me.userId}
                    name={me.displayName}
                    src={me.avatarUrl}
                    speaking={me.speaking}
                  />
                  <span className="me__name">{me.displayName}</span>
                  <span className="me__status">
                    {call.sharing && <span className="live">{t('common.live')}</span>}
                    {me.serverMicBlocked ? (
                      <Lock size={14} aria-label={t('pill.micBlocked')} />
                    ) : me.deafened ? (
                      <HeadphoneOff size={15} aria-label={t('pill.deafened')} />
                    ) : (
                      me.micMuted && <MicOff size={15} aria-label={t('pill.micOff')} />
                    )}
                  </span>
                </button>

                {notice ? (
                  <p className="pill__notice pill__notice--error" role="alert">
                    {notice}
                  </p>
                ) : (
                  call.sharing?.audio === 'failed' && (
                    <p className="pill__notice">{t('pill.streamingNoAudio')}</p>
                  )
                )}

                {call.status === 'reconnecting' && (
                  <p className="pill__notice">{t('pill.reconnecting')}</p>
                )}

                <div className="controls">
                  <IconButton
                    label={
                      me.serverMicBlocked
                        ? t('pill.micBlockedButton')
                        : me.micMuted
                          ? t('pill.micOn')
                          : t('pill.micMute')
                    }
                    tone={me.micMuted ? 'alert' : 'default'}
                    icon={me.micMuted ? <MicOff size={18} /> : <Mic size={18} />}
                    onClick={call.toggleMic}
                  />
                  <IconButton
                    label={me.deafened ? t('pill.undeafen') : t('pill.deafen')}
                    tone={me.deafened ? 'alert' : 'default'}
                    icon={me.deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
                    onClick={call.toggleDeafen}
                  />
                  <IconButton
                    label={call.sharing ? t('pill.shareStop') : t('pill.shareStart')}
                    tone={call.sharing ? 'on' : 'default'}
                    icon={call.sharing ? <MonitorX size={18} /> : <MonitorUp size={18} />}
                    onClick={call.toggleShare}
                  />
                  <IconButton
                    label={t('pill.settings')}
                    icon={<Settings2 size={18} />}
                    onClick={() => window.platform.panel.toggle()}
                  />
                  <span className="controls__spacer" />
                  <span className="people-button">
                    <IconButton
                      label={
                        someoneLive
                          ? t('pill.peopleLive', { n: participants.length })
                          : t('pill.people', { n: participants.length })
                      }
                      icon={<Users size={18} />}
                      onClick={call.openPeople}
                    />
                    <span className="people-button__count" aria-hidden>
                      {participants.length}
                    </span>
                    {someoneLive && <span className="people-button__live" aria-hidden />}
                  </span>
                  <IconButton
                    label={t('pill.leave')}
                    tone="danger"
                    icon={<PhoneOff size={18} />}
                    onClick={call.leave}
                  />
                </div>
              </>
            ) : call.status === 'connecting' ? (
              <div className="join join--busy" role="status">
                <span className="join__ring" aria-hidden>
                  <Loader size={16} className="spin" />
                </span>
                {t('pill.joining')}
              </div>
            ) : (
              <button
                type="button"
                className="join"
                onClick={() => window.platform.panel.toggle('channels')}
              >
                <span className="join__ring" aria-hidden>
                  <Plus size={16} />
                </span>
                {t('pill.join')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
