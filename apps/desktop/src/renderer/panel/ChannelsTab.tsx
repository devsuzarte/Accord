import {
  DEFAULT_API_PORT,
  DEFAULT_DISCOVERY_PORT,
  DEFAULT_LIVEKIT_PORT,
  normalizeServerUrl,
  shortServerAddress,
} from '@sharescreen/shared'
import type {
  CallSnapshot,
  DiscoveredServer,
  HostState,
  Profile,
  ServerRoute,
} from '@sharescreen/shared'
import { Avatar } from '@sharescreen/ui'
import {
  Check,
  ChevronDown,
  Copy,
  HeadphoneOff,
  Loader,
  LogIn,
  MicOff,
  PhoneOff,
  Plus,
  RefreshCw,
  Server,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { channelLabel, useT } from '../shared/i18n'
import { readJson, write } from '../shared/storage'
import { AudioSettings } from './AudioSettings'

type Mode = 'join' | 'host' | 'guide'

const SAVED_KEY = 'sharescreen.servers.saved'
const LAST_SERVER_KEY = 'sharescreen.join.server'

interface ChannelsTabProps {
  call: CallSnapshot
  profile: Profile
  onEditProfile(): void
}

/**
 * Aba Canais: Entrar (canais achados na rede, no Radmin e no Tailscale, ou por endereço),
 * Hospedar (o próprio PC vira o servidor) e Guia (como criar e como achar um canal).
 */
export function ChannelsTab({ call, profile, onEditProfile }: ChannelsTabProps) {
  const t = useT()
  const [mode, setMode] = useState<Mode>('join')
  const inCall = call.status === 'connected' || call.status === 'reconnecting'
  const modes: Mode[] = ['join', 'host', 'guide']

  return (
    <div className="stack">
      <div className="segments" role="tablist" aria-label={t('channels.modes')}>
        {modes.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className="segments__item"
            onClick={() => setMode(id)}
          >
            {t(`channels.${id}`)}
          </button>
        ))}
      </div>

      {mode === 'join' &&
        (inCall ? (
          <CurrentChannel call={call} />
        ) : (
          <JoinList call={call} profile={profile} onEditProfile={onEditProfile} />
        ))}
      {mode === 'host' && (
        <HostSection call={call} profile={profile} onEditProfile={onEditProfile} />
      )}
      {mode === 'guide' && <Guide />}

      {mode !== 'guide' && <AudioSection call={call} />}
    </div>
  )
}

// ───────────────────────── Na chamada ─────────────────────────

function CurrentChannel({ call }: { call: CallSnapshot }) {
  const t = useT()
  return (
    <>
      <div className="channel">
        <p className="channel__name">
          <Volume2 size={16} /> {channelLabel('geral', call.channelName ?? '')}
        </p>
        <ul className="channel__people">
          {call.participants.map((p) => (
            <li key={p.userId} className="channel__person">
              <Avatar
                id={p.userId}
                name={p.displayName}
                src={p.avatarUrl}
                size={24}
                speaking={p.speaking}
              />
              <span className="channel__person-name">
                {p.displayName}
                {p.isLocal && <span className="channel__you"> {t('common.you')}</span>}
              </span>
              {p.deafened ? (
                <HeadphoneOff size={14} className="channel__icon" aria-label={t('pill.deafened')} />
              ) : (
                p.micMuted && (
                  <MicOff size={14} className="channel__icon" aria-label={t('pill.micOff')} />
                )
              )}
            </li>
          ))}
        </ul>
      </div>
      {call.error && <p className="notice notice--warn">{call.error}</p>}
      <button
        type="button"
        className="action action--danger"
        onClick={() => window.platform.call.command({ type: 'leave' })}
      >
        <PhoneOff size={16} />
        {t('channels.leave')}
      </button>
    </>
  )
}

// ───────────────────────── Entrar ─────────────────────────

function NeedName({ onEditProfile }: { onEditProfile(): void }) {
  const t = useT()
  return (
    <div className="notice notice--warn notice--row">
      <span>{t('channels.needName')}</span>
      <button type="button" className="link-button" onClick={onEditProfile}>
        {t('channels.setName')}
      </button>
    </div>
  )
}

function join(profile: Profile, serverUrl: string): void {
  write(LAST_SERVER_KEY, serverUrl)
  window.platform.call.command({ type: 'join', name: profile.name, serverUrl })
}

function JoinList({ call, profile, onEditProfile }: ChannelsTabProps) {
  const t = useT()
  const [servers, setServers] = useState<DiscoveredServer[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [saved, setSaved] = useState<string[]>(() => readJson<string[]>(SAVED_KEY, []))
  const [address, setAddress] = useState('')
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [joiningUrl, setJoiningUrl] = useState<string | null>(null)
  const lastScan = useRef(0)

  const scan = useCallback(async (list: string[]) => {
    setScanning(true)
    lastScan.current = Date.now()
    try {
      setServers(await window.platform.discovery.scan(list))
    } catch (error) {
      console.error(error)
      setServers([])
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    // A busca começa logo depois de montar (fora do corpo do efeito).
    const first = setTimeout(() => void scan(readJson<string[]>(SAVED_KEY, [])), 0)
    // Procura de novo quando o painel volta a aparecer (se a última busca já é antiga).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastScan.current > 15_000) {
        void scan(readJson<string[]>(SAVED_KEY, []))
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scan])

  const saveList = (list: string[]) => {
    setSaved(list)
    write(SAVED_KEY, list)
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const value = address.trim()
    if (!value || probing) return
    setProbing(true)
    setProbeError(null)
    const result = await window.platform.discovery.probe(value)
    setProbing(false)
    if (!result.ok) {
      setProbeError(t('channels.notFoundAt', { address: shortServerAddress(result.url) }))
      return
    }
    const url = result.server.url
    if (!saved.includes(url)) saveList([...saved, url])
    setAddress('')
    setServers((list) => [...(list ?? []).filter((s) => s.id !== result.server.id), result.server])
  }

  const busy = call.status === 'connecting'
  const canJoin = !!profile.name && !busy
  const foundUrls = new Set((servers ?? []).map((s) => s.url))

  return (
    <>
      {!profile.name && <NeedName onEditProfile={onEditProfile} />}
      {call.error && <p className="notice notice--error">{call.error}</p>}

      <div className="list-head">
        <p className="row__title">{t('channels.found')}</p>
        <button
          type="button"
          className="icon-button"
          aria-label={t('channels.refresh')}
          title={t('channels.refresh')}
          disabled={scanning}
          onClick={() => void scan(saved)}
        >
          <RefreshCw size={15} className={scanning ? 'spin' : undefined} />
        </button>
      </div>

      {servers === null || (scanning && servers.length === 0) ? (
        <p className="searching" role="status">
          <Loader size={15} className="spin" /> {t('channels.searching')}
        </p>
      ) : servers.length === 0 ? (
        <div className="empty empty--left">
          <p className="empty__title empty__title--small">{t('channels.none')}</p>
          <p className="empty__text">{t('channels.noneText')}</p>
        </div>
      ) : (
        <ul className="servers">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              disabled={!canJoin}
              joining={busy && joiningUrl === server.url}
              onJoin={() => {
                setJoiningUrl(server.url)
                join(profile, server.url)
              }}
            />
          ))}
        </ul>
      )}

      <form className="add-address" onSubmit={(e) => void add(e)}>
        <label className="field">
          <span className="field__label">{t('channels.addAddress')}</span>
          <span className="field__row">
            <input
              className="field__input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('channels.addressPlaceholder')}
              spellCheck={false}
              disabled={probing}
            />
            <button
              type="submit"
              className="action action--small"
              disabled={probing || !address.trim()}
            >
              {probing ? t('channels.testing') : <Plus size={16} aria-label={t('channels.add')} />}
            </button>
          </span>
        </label>
        {probeError && <p className="notice notice--error">{probeError}</p>}
      </form>

      {saved.length > 0 && (
        <div className="saved">
          <span className="saved__label">{t('channels.saved')}</span>
          {saved.map((url) => (
            <span key={url} className="chip" data-offline={!foundUrls.has(url) || undefined}>
              {shortServerAddress(url)}
              {servers && !foundUrls.has(url) && (
                <span className="chip__note">{t('channels.offline')}</span>
              )}
              <button
                type="button"
                className="chip__remove"
                aria-label={t('channels.removeSaved', { address: shortServerAddress(url) })}
                title={t('channels.removeSaved', { address: shortServerAddress(url) })}
                onClick={() => saveList(saved.filter((s) => s !== url))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

const routeKey = (route: ServerRoute) => `route.${route}` as const

function ServerCard({
  server,
  disabled,
  joining,
  onJoin,
}: {
  server: DiscoveredServer
  disabled: boolean
  joining: boolean
  onJoin(): void
}) {
  const t = useT()
  return (
    <li className="server">
      <div className="server__head">
        <Server size={15} className="server__icon" aria-hidden />
        <span className="server__name">{server.name}</span>
        <span className="server__route" data-route={server.route}>
          {t(routeKey(server.route))}
        </span>
      </div>
      <p className="server__address">
        {server.route === 'this-pc' ? t('route.this-pc') : shortServerAddress(server.url)}
      </p>
      <ul className="server__channels">
        {server.channels.map((channel) => (
          <li key={channel.id} className="server__channel">
            <Volume2 size={15} aria-hidden />
            <span className="server__channel-name">{channelLabel(channel.id, channel.name)}</span>
            <span className="faces" aria-hidden>
              {channel.people.slice(0, 4).map((p, i) => (
                <Avatar
                  key={`${p.name}-${i}`}
                  id={p.name}
                  name={p.name}
                  src={p.avatar ? `${server.url}${p.avatar}` : null}
                  size={20}
                />
              ))}
            </span>
            <span className="server__count">
              {channel.people.length === 0
                ? t('channels.nobody')
                : channel.people.length === 1
                  ? t('channels.people.one')
                  : t('channels.people.other', { n: channel.people.length })}
            </span>
            <button
              type="button"
              className="action action--small action--primary"
              disabled={disabled}
              aria-label={t('channels.joinIn', { name: channelLabel(channel.id, channel.name) })}
              onClick={onJoin}
            >
              {joining ? <Loader size={14} className="spin" /> : <LogIn size={14} />}
              {t('channels.joinButton')}
            </button>
          </li>
        ))}
      </ul>
    </li>
  )
}

// ───────────────────────── Hospedar ─────────────────────────

function useHostState(): HostState | null {
  const [state, setState] = useState<HostState | null>(null)
  useEffect(() => {
    window.platform.host.getState().then(setState).catch(console.error)
    return window.platform.host.onChange(setState)
  }, [])
  return state
}

function CopyAddress({ address }: { address: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={copied ? t('common.copied') : t('host.copyAddress', { address })}
      title={copied ? t('common.copied') : t('host.copyAddress', { address })}
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

function HostSection({ call, profile, onEditProfile }: ChannelsTabProps) {
  const t = useT()
  const host = useHostState()
  if (!host) return null

  const live = host.status === 'running' || host.status === 'external'
  const inCall = call.status !== 'idle'

  if (host.status === 'unavailable') {
    return (
      <div className="empty empty--left">
        <p className="empty__title empty__title--small">{t('host.unavailable')}</p>
        <p className="empty__text">{t('host.unavailableText')}</p>
      </div>
    )
  }

  if (!live) {
    const starting = host.status === 'starting'
    return (
      <>
        <div>
          <p className="row__title">{t('host.title')}</p>
          <p className="row__text">{t('host.text')}</p>
        </div>
        {host.error && <p className="notice notice--error">{t(`host.err.${host.error}`)}</p>}
        <button
          type="button"
          className="action action--primary"
          disabled={starting}
          onClick={() => window.platform.host.start()}
        >
          {starting ? <Loader size={16} className="spin" /> : <Server size={16} />}
          {starting ? t('host.starting') : t('host.start')}
        </button>
        <p className="hint hint--flush">{t('host.firewall')}</p>
      </>
    )
  }

  return (
    <>
      <p className="hosting">
        <span className="hosting__dot" aria-hidden />
        {host.status === 'running' ? t('host.running') : t('host.external')}
      </p>
      {host.status === 'external' && <p className="row__text">{t('host.externalText')}</p>}

      <div>
        <p className="row__text">
          {host.addresses.length ? t('host.share') : t('host.noAddresses')}
        </p>
        <ul className="addresses">
          {host.addresses.map((a) => (
            <li key={a.address} className="address">
              <span className="address__route">{t(routeKey(a.route))}</span>
              <code className="address__ip">{a.address}</code>
              <CopyAddress address={a.address} />
            </li>
          ))}
        </ul>
      </div>

      {!profile.name && <NeedName onEditProfile={onEditProfile} />}
      {!inCall && (
        <button
          type="button"
          className="action action--primary"
          disabled={!profile.name}
          onClick={() => join(profile, normalizeServerUrl(host.url))}
        >
          <LogIn size={16} />
          {t('host.joinOwn')}
        </button>
      )}
      {host.status === 'running' && (
        <button
          type="button"
          className="action action--danger"
          onClick={() => window.platform.host.stop()}
        >
          <Square size={14} />
          {t('host.stop')}
        </button>
      )}
    </>
  )
}

// ───────────────────────── Guia ─────────────────────────

function Guide() {
  const t = useT()
  return (
    <div className="guide">
      <section>
        <h3 className="guide__title">{t('guide.createTitle')}</h3>
        <ol className="guide__steps">
          <li>{t('guide.create1')}</li>
          <li>{t('guide.create2')}</li>
          <li>{t('guide.create3')}</li>
          <li>{t('guide.create4')}</li>
        </ol>
      </section>
      <section>
        <h3 className="guide__title">{t('guide.findTitle')}</h3>
        <ol className="guide__steps">
          <li>{t('guide.find1')}</li>
          <li>{t('guide.find2')}</li>
          <li>{t('guide.find3')}</li>
        </ol>
      </section>
      <section>
        <h3 className="guide__title">{t('guide.farTitle')}</h3>
        <p className="guide__text">{t('guide.far')}</p>
      </section>
      <section>
        <h3 className="guide__title">{t('guide.portsTitle')}</h3>
        <dl className="ports">
          <dt>{DEFAULT_API_PORT} TCP</dt>
          <dd>{t('guide.portApi')}</dd>
          <dt>{DEFAULT_DISCOVERY_PORT} UDP</dt>
          <dd>{t('guide.portDiscovery')}</dd>
          <dt>
            {DEFAULT_LIVEKIT_PORT}–{DEFAULT_LIVEKIT_PORT + 1} TCP, {DEFAULT_LIVEKIT_PORT + 2} UDP
          </dt>
          <dd>{t('guide.portVoice')}</dd>
        </dl>
      </section>
    </div>
  )
}

// ───────────────────────── Áudio ─────────────────────────

/**
 * Áudio recolhível: começa fechado (o painel fica curto) e volta a fechar quando o painel
 * some. Fechado, mostra um resumo do que está em uso.
 */
function AudioSection({ call }: { call: CallSnapshot }) {
  const t = useT()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') setOpen(false)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const { audio } = call
  const summary = [
    audio.micMuted ? t('audio.summaryMicOff') : t('audio.summaryMicOn'),
    audio.noiseSuppression === 'rnnoise' ? t('audio.summaryNoise') : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <section className="section section--fold">
      <button
        type="button"
        className="fold"
        aria-expanded={open}
        aria-controls="audio-settings"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fold__text">
          <span className="section__title">{t('audio.title')}</span>
          {!open && <span className="fold__summary">{summary}</span>}
        </span>
        <ChevronDown size={16} className="fold__chevron" aria-hidden />
      </button>
      {open && (
        <div id="audio-settings">
          <AudioSettings audio={call.audio} />
        </div>
      )}
    </section>
  )
}
