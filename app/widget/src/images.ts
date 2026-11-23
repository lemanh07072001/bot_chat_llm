/**
 * Client-side checks and downscaling for image attachments. The api checks
 * again (magic bytes, size); this only spares the visitor a pointless upload.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const IMAGE_ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(',');
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MAX_EDGE = 2048;
const DOWNSCALE_ABOVE_BYTES = 1.5 * 1024 * 1024;
/** Bigger originals are refused rather than decoded (memory on phones). */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export type ImageProblem = 'TYPE' | 'SIZE';

export interface PreparedImage {
  blob: Blob;
  name: string;
  width: number | undefined;
  height: number | undefined;
}

/**
 * Checks before any work is done. A non-GIF a little over the limit is let
 * through because downscaling usually brings it under; `prepareImage`'s result
 * is checked again with `checkPrepared`.
 */
export function checkImage(file: Blob): ImageProblem | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'TYPE';
  if (file.size <= 0) return 'SIZE';
  if (file.size > MAX_IMAGE_BYTES && (file.type === 'image/gif' || file.size > MAX_SOURCE_BYTES)) {
    return 'SIZE';
  }
  return null;
}

export function checkPrepared(image: PreparedImage): ImageProblem | null {
  return image.blob.size > MAX_IMAGE_BYTES ? 'SIZE' : null;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed'));
    };
    img.src = url;
  });
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/**
 * Decodes with EXIF orientation applied, so re-encoding (which drops EXIF)
 * keeps the picture upright. Falls back to <img> (which also honours
 * orientation in current browsers) when createImageBitmap is unavailable.
 */
async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Unsupported option or format here: try <img>.
    }
  }

  const img = await loadImage(blob);
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

let webpSupport: Promise<boolean> | null = null;

/** Whether canvas can encode WebP; probed once on a 1×1 canvas and cached. */
function supportsWebpEncode(): Promise<boolean> {
  if (!webpSupport) {
    const probe = document.createElement('canvas');

    probe.width = 1;
    probe.height = 1;
    webpSupport = canvasToBlob(probe, 'image/webp', 0.85).then((blob) => blob?.type === 'image/webp');
  }

  return webpSupport;
}

function renameExt(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]*$/, '') || 'image';
  return `${base}.${ext}`;
}

/**
 * Reads the dimensions and, for big non-GIF images, re-encodes to at most
 * 2048px on the longest edge as WebP 0.85 (JPEG when WebP encoding is not
 * supported). JPEGs are always re-encoded to strip EXIF. GIFs are sent
 * untouched so animations survive.
 */
export async function prepareImage(file: Blob, fileName?: string): Promise<PreparedImage> {
  const name = (fileName || (file instanceof File ? file.name : '') || 'image').slice(0, 200);
  let img: DecodedImage;

  try {
    img = await decodeImage(file);
  } catch {
    // Undecodable here; let the server judge it.
    return { blob: file, name, width: undefined, height: undefined };
  }

  try {
    return await encodeImage(file, name, img);
  } finally {
    img.close();
  }
}

async function encodeImage(file: Blob, name: string, img: DecodedImage): Promise<PreparedImage> {
  const width = img.width || undefined;
  const height = img.height || undefined;

  if (file.type === 'image/gif' || !width || !height) {
    return { blob: file, name, width, height };
  }

  const longest = Math.max(width, height);
  // JPEGs are always re-encoded so EXIF (GPS, camera serial…) never leaves the device.
  const isJpeg = file.type === 'image/jpeg';

  if (!isJpeg && longest <= MAX_EDGE && file.size <= DOWNSCALE_ABOVE_BYTES) {
    return { blob: file, name, width, height };
  }

  const scale = Math.min(1, MAX_EDGE / longest);
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');

  canvas.width = targetW;
  canvas.height = targetH;

  const context = canvas.getContext('2d');

  if (!context) return { blob: file, name, width, height };

  const webp = await supportsWebpEncode();

  if (!webp) {
    // JPEG has no alpha: paint white first so transparent PNGs don't turn black (iOS).
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, targetW, targetH);
  }

  context.drawImage(img.source, 0, 0, targetW, targetH);

  const type = webp ? 'image/webp' : 'image/jpeg';
  const ext = webp ? 'webp' : 'jpg';
  let blob = await canvasToBlob(canvas, type, 0.85);

  canvas.width = 0;
  canvas.height = 0;

  if (blob && blob.type !== type) blob = null;

  // A re-encoded JPEG is kept even when larger (it drops the EXIF).
  if (!blob || (!isJpeg && blob.size >= file.size)) {
    // Re-encoding did not help; keep the original if it is still allowed.
    return { blob: file, name, width, height };
  }

  return { blob, name: renameExt(name, ext), width: targetW, height: targetH };
}

/** Only http(s) URLs are ever put into the DOM. */
export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;

  try {
    // No base: a relative or scheme-less value is rejected outright.
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
