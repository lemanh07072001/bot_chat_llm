/**
 * Image attachments, as every client and service sees them. Dependency-free on
 * purpose: the realtime service copies this file next to chat.service.
 */
export const ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

export interface AttachmentView {
  id: string;
  url: string;
  mimeType: AttachmentMimeType;
  size: number;
  width: number | null;
  height: number | null;
  name: string | null;
}

export type AttachmentOwnerKind = 'visitor' | 'agent';

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_NAME_MAX_LENGTH = 200;
export const ATTACHMENT_MAX_DIMENSION = 20000;

/** Stand-in text for a message, preview, email or Telegram line with no words. */
export const ATTACHMENT_PLACEHOLDER = '[Hình ảnh]';

export const ATTACHMENT_EXTENSIONS: Record<AttachmentMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Whitelists the stored fields into the wire shape (raw docs may carry more). */
export function serializeAttachments(attachments: unknown): AttachmentView[] {
  if (!Array.isArray(attachments)) return [];

  return attachments.flatMap((entry) => {
    const a = entry as Partial<Record<keyof AttachmentView, unknown>>;
    const mimeType = ATTACHMENT_MIME_TYPES.find((type) => type === a.mimeType);

    if (!a.id || typeof a.url !== 'string' || !mimeType) return [];

    return [
      {
        id: String(a.id),
        url: a.url,
        mimeType,
        size: typeof a.size === 'number' ? a.size : 0,
        width: typeof a.width === 'number' ? a.width : null,
        height: typeof a.height === 'number' ? a.height : null,
        name: typeof a.name === 'string' ? a.name : null,
      },
    ];
  });
}
