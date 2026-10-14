const MAX_WIDTH = 1600
const QUALITY = 0.8

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/** Resize to at most 1600px wide and re-encode as WebP (or JPEG where WebP is unsupported) at ~80%. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be read')
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image processing is not available in this browser')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const webp = await canvasToBlob(canvas, 'image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await canvasToBlob(canvas, 'image/jpeg')
  if (!jpeg) throw new Error('Image compression failed')
  return jpeg
}
