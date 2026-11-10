import type { CallSnapshot } from '@sharescreen/shared'
import { ChevronDown, Eye, EyeOff, Smartphone, Video, VideoOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../shared/i18n'
import { t as translateNow } from '../shared/i18n'

export interface VideoDevice {
  deviceId: string
  label: string
}

/**
 * Câmeras do sistema: webcam do notebook, USB, ou o celular quando ele aparece como webcam.
 * Os nomes só vêm depois de alguma captura de vídeo; até lá, "Câmera 1", "Câmera 2"...
 * (não abrimos a câmera só para descobrir os nomes: a luz acenderia sem a pessoa pedir).
 */
export function useVideoDevices(refreshKey: unknown): VideoDevice[] {
  const [devices, setDevices] = useState<VideoDevice[]>([])
  useEffect(() => {
    let alive = true
    const list = async () => {
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      if (!alive) return
      setDevices(
        all
          .filter((d) => d.kind === 'videoinput' && d.deviceId)
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || translateNow('camera.cameraN', { n: i + 1 }),
          })),
      )
    }
    void list()
    navigator.mediaDevices.addEventListener('devicechange', list)
    return () => {
      alive = false
      navigator.mediaDevices.removeEventListener('devicechange', list)
    }
  }, [refreshKey])
  return devices
}

/** Prévia local (não passa pela rede), espelhada como num espelho. */
function CameraPreview({ deviceId, onStarted }: { deviceId: string; onStarted: () => void }) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    navigator.mediaDevices
      .getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 640 },
          height: { ideal: 360 },
        },
      })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((track) => track.stop())
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
        onStarted()
      })
      .catch((error: unknown) => {
        const name = error instanceof DOMException ? error.name : ''
        setFailed(
          name === 'NotAllowedError'
            ? t('camera.err.denied')
            : name === 'NotReadableError'
              ? t('camera.err.busy')
              : t('camera.err.notFound'),
        )
      })
    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
    }
    // onStarted só serve para atualizar os nomes da lista; não reabre a câmera por causa dele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, t])

  return (
    <div className="camera__preview">
      {failed ? (
        <p className="camera__empty">{failed}</p>
      ) : (
        <video ref={videoRef} autoPlay muted playsInline className="camera__video" />
      )}
    </div>
  )
}

/**
 * Câmera recolhível (0.6.0): escolher o dispositivo, ver a prévia e ligar na chamada.
 * A escolha vai para o pill (dono da chamada), que salva e troca na hora se estiver ligada.
 */
export function CameraSection({ call }: { call: CallSnapshot }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [labelsKey, setLabelsKey] = useState(0)
  const devices = useVideoDevices(`${labelsKey}:${call.camera.on}`)
  const { camera } = call
  const inCall = call.status === 'connected'

  // O painel sumiu: fecha a seção e solta a câmera da prévia.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        setOpen(false)
        setPreview(false)
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const summary = camera.blocked
    ? t('pill.cameraBlocked')
    : camera.on
      ? t('people.cameraOn')
      : (devices.find((d) => d.deviceId === camera.deviceId)?.label ??
        (devices.length ? t('audio.systemDefault') : t('camera.none')))
  // Com a câmera ligada, a prévia aparece sozinha (é você vendo o que os outros veem).
  const showPreview = open && (preview || camera.on)

  return (
    <section className="section section--fold">
      <button
        type="button"
        className="fold"
        aria-expanded={open}
        aria-controls="camera-settings"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fold__text">
          <span className="section__title">{t('camera.title')}</span>
          {!open && <span className="fold__summary">{summary}</span>}
        </span>
        <ChevronDown size={16} className="fold__chevron" aria-hidden />
      </button>
      {open && (
        <div id="camera-settings" className="audio">
          <label className="field">
            <span className="field__label">
              <Video size={14} /> {t('camera.title')}
            </span>
            <select
              className="field__input field__select"
              value={camera.deviceId}
              onChange={(e) =>
                window.platform.call.command({ type: 'set-camera', deviceId: e.target.value })
              }
            >
              <option value="">{t('audio.systemDefault')}</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {showPreview ? (
            <CameraPreview
              // Trocar de câmera remonta a prévia (e limpa um erro anterior).
              key={camera.deviceId}
              deviceId={camera.deviceId}
              onStarted={() => setLabelsKey((k) => k + 1)}
            />
          ) : (
            <div className="camera__preview camera__preview--off">
              <VideoOff size={20} aria-hidden />
              <span>{t('camera.previewOff')}</span>
            </div>
          )}

          <div className="field__row">
            {!camera.on && (
              <button
                type="button"
                className="action action--small"
                onClick={() => setPreview((v) => !v)}
              >
                {preview ? <EyeOff size={14} /> : <Eye size={14} />}{' '}
                {preview ? t('camera.hidePreview') : t('camera.preview')}
              </button>
            )}
            <button
              type="button"
              className={`action action--small${camera.on ? '' : ' action--primary'}`}
              disabled={!inCall || camera.blocked || camera.starting}
              onClick={() => window.platform.call.command({ type: 'toggle-camera' })}
            >
              {camera.on ? <VideoOff size={14} /> : <Video size={14} />}{' '}
              {camera.on ? t('camera.turnOff') : t('camera.turnOn')}
            </button>
          </div>
          <p className="row__text">
            {camera.blocked
              ? t('pill.cameraBlocked')
              : camera.on
                ? t('camera.onAir')
                : inCall
                  ? null
                  : t('camera.offCall')}
          </p>
          <p className="row__text camera__hint">
            <Smartphone size={14} aria-hidden /> {t('camera.phoneHint')}
          </p>
        </div>
      )}
    </section>
  )
}
