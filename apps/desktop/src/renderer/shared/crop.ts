import { MAX_IMAGE_BYTES } from '@sharescreen/shared'
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { t } from './i18n'

/** Quadrado da imagem original que vira a foto (em pixels da imagem). */
export interface CropRect {
  x: number
  y: number
  side: number
}

/** Foto parada: recorta e reduz para `size`×`size` (WebP). */
export async function cropStill(bitmap: ImageBitmap, rect: CropRect, size = 256): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(t('image.process'))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, rect.x, rect.y, rect.side, rect.side, 0, 0, size, size)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.9),
  )
  if (!blob) throw new Error(t('image.process'))
  return blobToDataUrl(blob)
}

const MAX_FRAMES = 300

/**
 * GIF animado: decodifica quadro a quadro (ImageDecoder, nativo do Chromium), recorta cada
 * quadro e monta um GIF novo com o gifenc — a animação e o tempo de cada quadro continuam.
 */
export async function cropGif(
  file: Blob,
  rect: CropRect,
  onProgress: (done: number, total: number) => void,
  size = 200,
): Promise<string> {
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' })
  try {
    await decoder.completed
    const track = decoder.tracks.selectedTrack
    const total = Math.min(track?.frameCount ?? 1, MAX_FRAMES)
    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error(t('image.process'))
    ctx.imageSmoothingQuality = 'high'
    const gif = GIFEncoder()
    for (let index = 0; index < total; index++) {
      const { image } = await decoder.decode({ frameIndex: index })
      // duração em microssegundos; GIFs sem tempo ganham 100 ms (o padrão dos navegadores)
      const delay = Math.max(20, Math.round((image.duration ?? 100_000) / 1000))
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, size, size)
      image.close()
      const { data } = ctx.getImageData(0, 0, size, size)
      const palette = quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), size, size, { palette, delay })
      onProgress(index + 1, total)
      // Devolve a vez para a tela atualizar o progresso.
      if (index % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0))
    }
    gif.finish()
    const bytes = gif.bytes()
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(t('image.gifResult'))
    return blobToDataUrl(new Blob([bytes as BlobPart], { type: 'image/gif' }))
  } finally {
    decoder.close()
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(t('image.read')))
    reader.readAsDataURL(blob)
  })
}
