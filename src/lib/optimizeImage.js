const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Resize to fit within `maxSize` and re-encode as WebP. Returns the original file if
// it is already small or can't be improved (e.g. animated GIFs are left untouched).
export async function optimizeImage(file, { maxSize = 1280, quality = 0.82 } = {}) {
  if (!ALLOWED.includes(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.')
  if (file.type === 'image/gif') return file

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  if (!blob || (scale === 1 && blob.size >= file.size)) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}
