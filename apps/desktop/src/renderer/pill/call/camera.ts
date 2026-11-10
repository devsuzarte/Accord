import { VideoPresets } from 'livekit-client'
import type { TrackPublishOptions, VideoCaptureOptions } from 'livekit-client'
import { t } from '../../shared/i18n'

/**
 * Câmera (0.6.0). Qualquer entrada de vídeo que o sistema mostra serve: a webcam do notebook,
 * uma câmera USB ou o celular quando ele aparece como webcam (ex.: pelo recurso de câmera do
 * celular do Windows ou por um app de webcam). O Accord não tem app de celular.
 */

const DEVICE_KEY = 'sharescreen.camera.device'

export function readCameraDevice(): string {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveCameraDevice(deviceId: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, deviceId)
  } catch {
    /* ignora */
  }
}

/** 720p a 30 fps; '' = a câmera padrão do sistema. */
export function cameraCapture(deviceId: string): VideoCaptureOptions {
  return {
    deviceId: deviceId || undefined,
    resolution: VideoPresets.h720.resolution,
  }
}

/**
 * Com camadas de 180p e 360p: a janela pequena de quem assiste pega a camada pequena, e a
 * camada de 720p só é codificada enquanto alguém precisar dela (dynacast).
 */
export const cameraPublish: TrackPublishOptions = {
  name: 'camera',
  simulcast: true,
  videoEncoding: VideoPresets.h720.encoding,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
}

/** Frase para quando a câmera não abre. */
export function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return t('camera.err.denied')
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('camera.err.notFound')
  if (name === 'NotReadableError' || name === 'AbortError') return t('camera.err.busy')
  return t('camera.err.failed', {
    reason: error instanceof Error ? error.message : t('call.err.unknown'),
  })
}
