import { t } from './i18n'
import { MAX_IMAGE_BYTES } from '@sharescreen/shared'

const accepted = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const IMAGE_ACCEPT = accepted.join(',')

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(t('image.read')))
    reader.readAsDataURL(file)
  })
}

/**
 * Prepara uma imagem escolhida pela pessoa.
 * GIF fica como está (para continuar animado); as outras são reduzidas para `maxSide`
 * (e recortadas em quadrado se `square`), o que deixa o arquivo bem menor.
 */
export async function prepareImage(
  file: File,
  { maxSide, square = false }: { maxSide: number; square?: boolean },
): Promise<string> {
  if (!accepted.includes(file.type)) {
    throw new Error(t('image.type'))
  }
  if (file.type === 'image/gif') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(t('image.gifTooBig'))
    return readAsDataUrl(file)
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(t('image.open'))
  })
  const side = square ? Math.min(bitmap.width, bitmap.height) : 0
  const sw = square ? side : bitmap.width
  const sh = square ? side : bitmap.height
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(t('image.process'))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    bitmap,
    (bitmap.width - sw) / 2,
    (bitmap.height - sh) / 2,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.88),
  )
  if (!blob) throw new Error(t('image.process'))
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(t('image.tooBig'))
  return readAsDataUrl(blob)
}
