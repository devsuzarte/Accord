import { MAX_IMAGE_BYTES } from '@sharescreen/shared'
import { Crosshair, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react'
import { cropGif, cropStill } from '../shared/crop'
import type { CropRect } from '../shared/crop'
import { useT } from '../shared/i18n'

/** Lado da área de recorte na tela (px). */
const VIEW = 220
const MIN_ZOOM = 1
const MAX_ZOOM = 5

interface Framing {
  zoom: number
  /** Deslocamento do centro da imagem em relação ao centro da área (px de tela). */
  x: number
  y: number
}

const centered: Framing = { zoom: 1, x: 0, y: 0 }

/**
 * Editor da foto de perfil: arrastar para enquadrar, zoom pelo controle, pela rodinha ou
 * pelas teclas (+ e −, setas movem). O círculo mostra como a foto aparece para os outros.
 * GIF continua animado: o mesmo recorte é aplicado em todos os quadros.
 */
export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File
  onCancel(): void
  onDone(dataUrl: string): void
}) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [framing, setFraming] = useState<Framing>(centered)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const isGif = file.type === 'image/gif'

  useEffect(() => {
    let alive = true
    let loaded: ImageBitmap | null = null
    createImageBitmap(file)
      .then((b) => {
        loaded = b
        if (alive) setBitmap(b)
        else b.close()
      })
      .catch(() => alive && setError(t('image.open')))
    return () => {
      alive = false
      loaded?.close()
    }
  }, [file, t])

  /** Escala que faz o lado menor da imagem preencher a área (zoom 1). */
  const baseScale = bitmap ? VIEW / Math.min(bitmap.width, bitmap.height) : 1

  /** Mantém a imagem cobrindo a área inteira (sem bordas vazias no círculo). */
  const clamp = useCallback(
    (next: Framing): Framing => {
      if (!bitmap) return next
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.zoom))
      const scale = baseScale * zoom
      const maxX = Math.max(0, (bitmap.width * scale - VIEW) / 2)
      const maxY = Math.max(0, (bitmap.height * scale - VIEW) / 2)
      return {
        zoom,
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      }
    },
    [bitmap, baseScale],
  )

  // Desenha a prévia (2× para ficar nítida em telas com escala).
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !bitmap) return
    const ratio = 2
    canvas.width = canvas.height = VIEW * ratio
    const scale = baseScale * framing.zoom
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, VIEW, VIEW)
    ctx.drawImage(bitmap, VIEW / 2 + framing.x - w / 2, VIEW / 2 + framing.y - h / 2, w, h)
  }, [bitmap, framing, baseScale])

  const update = (patch: Partial<Framing>) => setFraming((f) => clamp({ ...f, ...patch }))

  /** Zoom mantendo o mesmo ponto no centro. */
  const zoomTo = (zoom: number) =>
    setFraming((f) => {
      const ratio = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) / f.zoom
      return clamp({ zoom: f.zoom * ratio, x: f.x * ratio, y: f.y * ratio })
    })

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY }
  }
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    drag.current = { x: event.clientX, y: event.clientY }
    setFraming((f) => clamp({ ...f, x: f.x + dx, y: f.y + dy }))
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    zoomTo(framing.zoom * Math.exp(-event.deltaY * 0.0015))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 24 : 8
    const moves: Record<string, Partial<Framing>> = {
      ArrowLeft: { x: framing.x + step },
      ArrowRight: { x: framing.x - step },
      ArrowUp: { y: framing.y + step },
      ArrowDown: { y: framing.y - step },
    }
    if (moves[event.key]) {
      event.preventDefault()
      update(moves[event.key]!)
    } else if (event.key === '+' || event.key === '=') zoomTo(framing.zoom * 1.1)
    else if (event.key === '-') zoomTo(framing.zoom / 1.1)
  }

  // Esc aqui cancela o recorte (e não fecha o painel).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || progress) return
      event.stopImmediatePropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel, progress])

  const apply = async () => {
    if (!bitmap) return
    const scale = baseScale * framing.zoom
    const rect: CropRect = {
      side: VIEW / scale,
      x: (bitmap.width * scale) / 2 - VIEW / 2 - framing.x,
      y: (bitmap.height * scale) / 2 - VIEW / 2 - framing.y,
    }
    rect.x /= scale
    rect.y /= scale
    setError(null)
    setProgress(t('crop.processing'))
    try {
      if (isGif && file.size > MAX_IMAGE_BYTES * 3) throw new Error(t('image.gifTooBig'))
      const result = isGif
        ? await cropGif(file, rect, (done, total) =>
            setProgress(t('crop.processingGif', { done, total })),
          )
        : await cropStill(bitmap, rect)
      onDone(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile.photoError'))
      setProgress(null)
    }
  }

  return (
    <div className="cropper">
      <p className="row__title">{t('crop.title')}</p>
      <p className="row__text">{t('crop.hint')}</p>

      <div className="cropper__stage" style={{ width: VIEW, height: VIEW }}>
        <canvas
          ref={canvasRef}
          className="cropper__canvas"
          style={{ width: VIEW, height: VIEW }}
          tabIndex={0}
          aria-label={t('crop.area')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        />
        <span className="cropper__mask" aria-hidden />
      </div>

      <div className="cropper__zoom">
        <button
          type="button"
          className="cropper__icon"
          aria-label={t('crop.zoomOut')}
          title={t('crop.zoomOut')}
          onClick={() => zoomTo(framing.zoom / 1.2)}
        >
          <ZoomOut size={16} />
        </button>
        <input
          type="range"
          className="slider"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={framing.zoom}
          aria-label={t('crop.zoom')}
          onChange={(e) => zoomTo(Number(e.target.value))}
        />
        <button
          type="button"
          className="cropper__icon"
          aria-label={t('crop.zoomIn')}
          title={t('crop.zoomIn')}
          onClick={() => zoomTo(framing.zoom * 1.2)}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          className="cropper__icon"
          aria-label={t('crop.reset')}
          title={t('crop.reset')}
          onClick={() => setFraming(centered)}
        >
          <Crosshair size={16} />
        </button>
      </div>

      {isGif && <p className="field__hint">{t('crop.gifNote')}</p>}
      {error && <p className="notice notice--error">{error}</p>}

      <div className="cropper__actions">
        <button type="button" className="action" onClick={onCancel} disabled={!!progress}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="action action--primary"
          onClick={() => void apply()}
          disabled={!bitmap || !!progress}
        >
          {progress ?? t('crop.apply')}
        </button>
      </div>
    </div>
  )
}
