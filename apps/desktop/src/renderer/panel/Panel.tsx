import type { HotkeyInfo, OverlayCorner, PanelTab } from '@sharescreen/shared'
import { useReportSize } from '@sharescreen/ui'
import { Ghost, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOverlayState } from '../shared/useOverlayState'
import { useCallSnapshot } from '../shared/useCallSnapshot'
import { useProfile } from '../shared/useProfile'
import { useT } from '../shared/i18n'
import { readString } from '../shared/storage'
import { AppearanceTab } from './AppearanceTab'
import { ChannelsTab } from './ChannelsTab'
import { ProfileTab } from './ProfileTab'
import { UserBar } from './UserBar'
import logoUrl from '../shared/assets/logo.svg'

const tabs: PanelTab[] = ['channels', 'you', 'appearance', 'overlay']

/** Onde versões antigas guardavam o nome (antes do perfil). */
const LEGACY_NAME_KEY = 'sharescreen.join.name'

/** "CommandOrControl+Shift+O" → "Ctrl + Shift + O" */
function formatAccelerator(accelerator: string): string {
  return accelerator.replace('CommandOrControl', 'Ctrl').split('+').join(' + ')
}

export function Panel() {
  const t = useT()
  const [tab, setTab] = useState<PanelTab>('channels')
  const call = useCallSnapshot()
  const profile = useProfile()
  const frameRef = useReportSize<HTMLDivElement>((size) => window.platform.panel.resize(size))

  useEffect(() => window.platform.panel.onOpenTab(setTab), [])

  // Versões anteriores guardavam só o nome, no painel: passa para o perfil uma vez.
  useEffect(() => {
    if (profile && !profile.name) {
      const legacy = readString(LEGACY_NAME_KEY, '').trim()
      if (legacy) window.platform.profile.set({ ...profile, name: legacy })
    }
  }, [profile])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.platform.panel.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={frameRef} className="surface-frame">
      <section className="panel material" aria-label={t('panel.label')}>
        <header className="panel__head">
          <img className="panel__logo" src={logoUrl} alt="Accord" title="Accord" draggable={false} />
          <div className="tabs" role="tablist">
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className="tabs__tab"
                onClick={() => setTab(id)}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="panel__close"
            aria-label={t('panel.close')}
            title={t('common.closeEsc')}
            onClick={() => window.platform.panel.close()}
          >
            <X size={16} />
          </button>
        </header>

        <div className="panel__content" role="tabpanel">
          {profile && tab === 'channels' && (
            <ChannelsTab call={call} profile={profile} onEditProfile={() => setTab('you')} />
          )}
          {profile && tab === 'you' && (
            <ProfileTab
              key={profile.name}
              profile={profile}
              inCall={call.status === 'connected' || call.status === 'reconnecting'}
            />
          )}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'overlay' && <OverlayTab />}
        </div>

        <UserBar call={call} profile={profile} />
      </section>
    </div>
  )
}

const corners: OverlayCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

function OverlayTab() {
  const t = useT()
  const overlay = useOverlayState()
  const [hotkeys, setHotkeys] = useState<HotkeyInfo[]>([])

  useEffect(() => {
    window.platform.hotkeys.list().then(setHotkeys).catch(console.error)
  }, [])

  const current: OverlayCorner | null =
    overlay.edges.vertical && overlay.edges.horizontal
      ? `${overlay.edges.vertical}-${overlay.edges.horizontal}`
      : null

  const ghostHotkey = hotkeys.find((h) => h.id === 'toggle-ghost')

  return (
    <div className="stack stack--loose">
      <div className="row">
        <div>
          <p className="row__title">
            <Ghost size={15} /> {t('overlay.ghost')}
          </p>
          <p className="row__text">
            {t('overlay.ghostText', {
              key: ghostHotkey
                ? formatAccelerator(ghostHotkey.accelerator)
                : t('overlay.theShortcut'),
            })}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={overlay.ghost}
          aria-label={t('overlay.ghost')}
          className="switch"
          onClick={() => window.platform.overlay.setGhost(!overlay.ghost)}
        />
      </div>

      <div>
        <p className="row__title">{t('overlay.position')}</p>
        <p className="row__text">{t('overlay.positionText')}</p>
        <div className="screen" role="group" aria-label={t('overlay.position')}>
          {corners.map((id) => (
            <button
              key={id}
              type="button"
              className="screen__corner"
              data-corner={id}
              aria-label={t(`corner.${id}`)}
              aria-pressed={current === id}
              title={t(`corner.${id}`)}
              onClick={() => window.platform.overlay.moveTo(id)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="row__title">{t('overlay.hotkeys')}</p>
        <ul className="keys">
          {hotkeys.map((h) => (
            <li key={h.id} className="keys__item">
              <span>{t(`hotkey.${h.id}`)}</span>
              <kbd data-broken={!h.registered || undefined}>{formatAccelerator(h.accelerator)}</kbd>
              {!h.registered && <span className="keys__warn">{t('overlay.hotkeyBusy')}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
