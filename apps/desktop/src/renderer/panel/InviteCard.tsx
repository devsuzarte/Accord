import { inviteSecret, isPrivateIPv4, shortServerAddress } from '@sharescreen/shared'
import type { CallSnapshot, Invite, Profile } from '@sharescreen/shared'
import { Link2, Loader, Lock, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../shared/i18n'

/** Convite que abriu o app (link accord://) ou que a pessoa colou em "Adicionar endereço". */
export function useInvite(): [Invite | null, (invite: Invite | null) => void] {
  const [invite, setInvite] = useState<Invite | null>(null)
  useEffect(() => {
    window.platform.invite
      .take()
      .then((pending) => pending && setInvite(pending))
      .catch(console.error)
    return window.platform.invite.onInvite(setInvite)
  }, [])
  return [invite, setInvite]
}

export function InviteCard({
  invite,
  call,
  profile,
  onJoin,
  onDismiss,
}: {
  invite: Invite
  call: CallSnapshot
  profile: Profile
  onJoin(serverUrl: string, password: string | null): void
  onDismiss(): void
}) {
  const t = useT()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waitingLeave, setWaitingLeave] = useState(false)
  const inCall = call.status !== 'idle'
  const address = shortServerAddress(invite.serverUrl)

  const join = async () => {
    setChecking(true)
    setError(null)
    const result = await window.platform.discovery.probe(invite.serverUrl)
    setChecking(false)
    if (!result.ok) {
      setError(t('invite.notFound', { address }))
      return
    }
    if (inCall) {
      // Sai da chamada atual e entra no convite quando a saída terminar.
      setWaitingLeave(true)
      window.platform.call.command({ type: 'leave' })
      return
    }
    onJoin(result.server.url, inviteSecret(invite))
  }

  useEffect(() => {
    if (!waitingLeave || call.status !== 'idle') return
    const timer = setTimeout(() => onJoin(invite.serverUrl, inviteSecret(invite)), 0)
    return () => clearTimeout(timer)
  }, [waitingLeave, call.status, invite, onJoin])

  return (
    <section className="invite" aria-label={t('invite.title')}>
      <p className="invite__title">
        <Link2 size={15} aria-hidden /> {t('invite.title')}
      </p>
      <p className="invite__server">
        {invite.name ? t('invite.from', { name: invite.name }) : address}
        {invite.name && <span className="invite__address">{address}</span>}
      </p>
      {(invite.key || invite.password) && (
        <p className="invite__note">
          <Lock size={12} aria-hidden /> {t('invite.withPassword')}
        </p>
      )}
      {!isPrivateIPv4(new URL(invite.serverUrl).hostname) && (
        <p className="notice notice--warn">{t('invite.publicAddress')}</p>
      )}
      {error && <p className="notice notice--error">{error}</p>}
      <div className="invite__actions">
        <button
          type="button"
          className="action action--small action--primary"
          disabled={checking || waitingLeave || !profile.name}
          onClick={() => void join()}
        >
          {checking || waitingLeave ? <Loader size={14} className="spin" /> : <LogIn size={14} />}
          {checking ? t('invite.checking') : inCall ? t('invite.leaveAndJoin') : t('invite.join')}
        </button>
        <button type="button" className="action action--small action--quiet" onClick={onDismiss}>
          {t('invite.dismiss')}
        </button>
      </div>
    </section>
  )
}
