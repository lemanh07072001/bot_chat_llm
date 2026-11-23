/**
 * Image attachments shared by the inbox and ticket composers.
 *
 * Types and constants are safe everywhere. `prepareImage` / `uploadImage` use
 * browser APIs (canvas, XMLHttpRequest) and must only be called client-side.
 */

export const ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

export type AttachmentView = {
  id: string;
  url: string;
  mimeType: AttachmentMimeType;
  size: number;
  width: number | null;
  height: number | null;
  name: string | null;
};

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Value for `<input type="file" accept>`. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_MIME_TYPES.join(",");
/** Text stand-in for a message that only carries images. */
export const ATTACHMENT_PLACEHOLDER = "[Hình ảnh]";

export const ATTACHMENT_ERRORS = {
  tooMany: `Tối đa ${MAX_ATTACHMENTS} ảnh mỗi lần gửi.`,
  type: "Chỉ hỗ trợ ảnh JPEG, PNG, WebP hoặc GIF.",
  size: "Ảnh vượt quá 10 MB.",
  decode: "Không đọc được ảnh.",
  network: "Không thể kết nối máy chủ.",
  upload: "Tải ảnh lên thất bại.",
  noSite: "Không xác định được trang web.",
  /** Server reply when an id was already claimed (or never valid). */
  claimed: "Ảnh không hợp lệ hoặc đã được dùng.",
  /** Send-button tooltip while a failed upload is still in the tray. */
  retryHint: "Có ảnh tải lên lỗi — thử lại hoặc xoá ảnh đó.",
} as const;

/** Downscale threshold / target for non-GIF images. */
const MAX_EDGE = 2048;
const DOWNSCALE_BYTES = 1.5 * 1024 * 1024;
const OUTPUT_QUALITY = 0.85;
/** Refuse to decode absurdly large originals in the browser. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export function isAttachmentMimeType(value: unknown): value is AttachmentMimeType {
  return typeof value === "string" && (ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

/** Only http(s) URLs may end up in an <a href>/<img src>. */
export function isSafeImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export type PreparedImage = {
  file: Blob;
  name: string;
  width: number;
  height: number;
  mimeType: AttachmentMimeType;
};

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(ATTACHMENT_ERRORS.decode));
    };
    img.src = url;
  });
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

/**
 * Decodes with EXIF orientation applied, so re-encoding (which drops EXIF)
 * keeps the picture upright. Falls back to <img> (which also honours
 * orientation in current browsers) when createImageBitmap is unavailable.
 */
async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
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
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    webpSupport = canvasToBlob(probe, "image/webp", OUTPUT_QUALITY).then((blob) => blob?.type === "image/webp");
  }
  return webpSupport;
}

function renameExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]*$/, "") || "image";
  return `${base}.${ext}`;
}

/**
 * Validates an image picked by the user and, for non-GIF images that are large
 * (longest edge > 2048 or > 1.5 MB), re-encodes it to max edge 2048 as WebP 0.85
 * (JPEG fallback). JPEGs are always re-encoded so EXIF/GPS is stripped. GIFs are
 * uploaded untouched. Throws Error with a Vietnamese
 * message on failure.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isAttachmentMimeType(file.type)) throw new Error(ATTACHMENT_ERRORS.type);
  const mimeType = file.type;
  const name = (file.name || "image").slice(0, 200);

  if (file.size <= 0) throw new Error(ATTACHMENT_ERRORS.decode);
  if (mimeType === "image/gif" || file.size > MAX_SOURCE_BYTES) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(ATTACHMENT_ERRORS.size);
  }

  const img = await decodeImage(file);
  try {
    return await encodeImage(file, name, mimeType, img);
  } finally {
    img.close();
  }
}

async function encodeImage(
  file: File,
  name: string,
  mimeType: AttachmentMimeType,
  img: DecodedImage,
): Promise<PreparedImage> {
  const { width, height } = img;
  if (!width || !height) throw new Error(ATTACHMENT_ERRORS.decode);

  const longest = Math.max(width, height);
  const isJpeg = mimeType === "image/jpeg";
  const needsWork =
    mimeType !== "image/gif" && (isJpeg || longest > MAX_EDGE || file.size > DOWNSCALE_BYTES);
  if (!needsWork) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(ATTACHMENT_ERRORS.size);
    return { file, name, width, height, mimeType };
  }

  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(ATTACHMENT_ERRORS.size);
    return { file, name, width, height, mimeType };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const webp = await supportsWebpEncode();
  const outType: AttachmentMimeType = webp ? "image/webp" : "image/jpeg";
  if (!webp) {
    // No WebP encoder (older Safari): JPEG has no alpha, so paint white first.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outWidth, outHeight);
  }
  ctx.drawImage(img.source, 0, 0, outWidth, outHeight);

  const out: Blob | null = await canvasToBlob(canvas, outType, OUTPUT_QUALITY);
  canvas.width = 0;
  canvas.height = 0;

  // Re-encoding did not help and no resize was needed: keep the original
  // (a re-encoded JPEG is kept anyway — it no longer carries EXIF).
  if (!out || out.type !== outType || (!isJpeg && scale === 1 && out.size >= file.size)) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(ATTACHMENT_ERRORS.size);
    return { file, name, width, height, mimeType };
  }
  if (out.size > MAX_ATTACHMENT_BYTES) throw new Error(ATTACHMENT_ERRORS.size);
  return {
    file: out,
    name: renameExtension(name, outType === "image/webp" ? "webp" : "jpg").slice(0, 200),
    width: outWidth,
    height: outHeight,
    mimeType: outType,
  };
}

function readUploadError(xhr: XMLHttpRequest): string {
  try {
    const data = JSON.parse(xhr.responseText) as { error?: unknown; message?: unknown };
    const message = data.error ?? data.message;
    if (typeof message === "string" && message) return message;
    if (Array.isArray(message) && message.length) return message.join(", ");
  } catch {
    // not JSON
  }
  if (xhr.status === 413) return ATTACHMENT_ERRORS.size;
  return ATTACHMENT_ERRORS.upload;
}

function isAttachmentView(value: unknown): value is AttachmentView {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "url" in value &&
    typeof value.url === "string"
  );
}

/**
 * Uploads one prepared image through the admin route handler (/api/uploads).
 * `onProgress` receives 0..1. Rejects with an Error carrying a Vietnamese message;
 * an aborted upload rejects with a DOMException named "AbortError".
 */
export function uploadImage(
  siteId: string,
  prepared: PreparedImage,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<AttachmentView> {
  return new Promise((resolve, reject) => {
    if (!siteId) {
      reject(new Error(ATTACHMENT_ERRORS.noSite));
      return;
    }
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const form = new FormData();
    form.append("file", prepared.file, prepared.name);
    form.append("siteId", siteId);
    form.append("width", String(prepared.width));
    form.append("height", String(prepared.height));
    form.append("name", prepared.name);

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.open("POST", "/api/uploads");
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data: unknown = JSON.parse(xhr.responseText);
          if (isAttachmentView(data)) {
            onProgress?.(1);
            resolve(data);
            return;
          }
        } catch {
          // fall through
        }
        reject(new Error(ATTACHMENT_ERRORS.upload));
        return;
      }
      reject(new Error(readUploadError(xhr)));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error(ATTACHMENT_ERRORS.network));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    xhr.send(form);
  });
}
