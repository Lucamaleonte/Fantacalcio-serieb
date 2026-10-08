// Ridimensiona nel browser l'immagine scelta: quadrato centrale di 256 px,
// in WebP (o PNG se il browser non sa creare WebP). Usa il DOM: niente test.
import { coverCrop, LOGO_SIZE, MAX_SOURCE_BYTES } from './logo'

export async function resizeLogo(
  file: File,
): Promise<{ blob: Blob; type: 'image/webp' | 'image/png' }> {
  if (!file.type.startsWith('image/'))
    throw new Error('Il file scelto non è un’immagine')
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error('Immagine troppo grande (massimo 15 MB)')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(
      'Formato non supportato: prova con una foto JPG o PNG (o uno screenshot)',
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = LOGO_SIZE
  canvas.height = LOGO_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Il browser non riesce a elaborare l’immagine')
  const { sx, sy, size } = coverCrop(bitmap.width, bitmap.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, LOGO_SIZE, LOGO_SIZE)
  bitmap.close()

  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // Alcuni Safari ignorano WebP e restituiscono PNG
  const webp = await toBlob('image/webp', 0.85)
  if (webp && webp.type === 'image/webp')
    return { blob: webp, type: 'image/webp' }
  const png = await toBlob('image/png')
  if (!png) throw new Error('Il browser non riesce a elaborare l’immagine')
  return { blob: png, type: 'image/png' }
}
