import type { ProofAttachmentInput } from '@waypoint/shared';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 64_000_000;
export const PHOTO_BYTES = 1024 * 1024;
export const SIGNATURE_BYTES = 256 * 1024;

export function attachmentDataUrl(attachment: ProofAttachmentInput) {
  return `data:${attachment.contentType};base64,${attachment.base64}`;
}
function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This image could not be prepared. Try another photo.')), type, quality));
}
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('This image could not be read. Try another photo.'));
    reader.readAsDataURL(blob);
  });
}
async function openImage(file: Blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap as CanvasImageSource, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file), image = new Image();
  image.src = url;
  try { await image.decode(); }
  catch { URL.revokeObjectURL(url); throw new Error('Choose a readable JPEG or PNG image.'); }
  return { source: image as CanvasImageSource, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}
export async function compressProofImage(file: Blob, kind: ProofAttachmentInput['kind'] = 'PHOTO'): Promise<ProofAttachmentInput> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPEG or PNG image. HEIC and other formats are not supported.');
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('Choose an image smaller than 20 MiB.');
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (!jpeg && !png) throw new Error('The selected file is not a JPEG or PNG image.');
  const image = await openImage(file).catch(() => { throw new Error('This image could not be decoded. Choose another JPEG or PNG.'); });
  try {
    if (!image.width || !image.height || image.width * image.height > MAX_SOURCE_PIXELS) throw new Error('Choose a photo with a lower resolution, below 64 megapixels.');
    const contentType = kind === 'SIGNATURE' ? 'image/png' : 'image/jpeg';
    const limit = kind === 'SIGNATURE' ? SIGNATURE_BYTES : PHOTO_BYTES;
    let scale = Math.min(1, 1600 / image.width, (kind === 'SIGNATURE' ? 800 : 1600) / image.height);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image preparation is unavailable on this device.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, contentType, Math.max(0.55, 0.86 - attempt * 0.05));
      if (blob.size <= limit) return { kind, contentType, base64: await base64(blob) };
      scale *= 0.8;
    }
    throw new Error('This image is still too large. Try a simpler or smaller image.');
  } finally { image.release(); }
}
export function signatureAttachment(canvas: HTMLCanvasElement) {
  return canvasBlob(canvas, 'image/png').then(blob => compressProofImage(blob, 'SIGNATURE'));
}
