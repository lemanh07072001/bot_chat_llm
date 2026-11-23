import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Upload, UploadDocument } from './upload.schema.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { toAttachmentView } from './attachments.service.js';
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_DIMENSION,
  ATTACHMENT_NAME_MAX_LENGTH,
  MAX_ATTACHMENT_BYTES,
  type AttachmentMimeType,
  type AttachmentOwnerKind,
  type AttachmentView,
} from './attachment.types.js';

export const ATTACHMENT_TOO_LARGE_MESSAGE = 'Ảnh vượt quá 10MB.';
export const ATTACHMENT_BAD_TYPE_MESSAGE = 'Chỉ hỗ trợ ảnh JPEG, PNG, WebP hoặc GIF.';

export interface StoreAttachmentInput {
  buffer: Buffer;
  /** Client-supplied hints; validated, never trusted. */
  name?: unknown;
  width?: unknown;
  height?: unknown;
  siteId: string;
  ownerKind: AttachmentOwnerKind;
  ownerId: string;
  conversationId?: string | null;
}

/** The type is read from the bytes; the declared Content-Type is ignored. */
export function sniffImageType(buffer: Buffer): AttachmentMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buffer.length >= 6) {
    const head = buffer.toString('ascii', 0, 6);
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function dimension(value: unknown): number | null {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{1,5}$/.test(value.trim())
        ? Number(value.trim())
        : NaN;

  return Number.isInteger(number) && number >= 1 && number <= ATTACHMENT_MAX_DIMENSION
    ? number
    : null;
}

function displayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Control characters have no business in a filename shown to people.
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name ? name.slice(0, ATTACHMENT_NAME_MAX_LENGTH) : null;
}

/** API only: validates an uploaded image, stores it and records the upload. */
@Injectable()
export class AttachmentUploadService {
  constructor(
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    private readonly storage: AttachmentStorageService,
  ) {}

  async store(input: StoreAttachmentInput): Promise<AttachmentView> {
    const size = input.buffer?.length ?? 0;

    if (size > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException(ATTACHMENT_TOO_LARGE_MESSAGE);
    }
    if (size < 1) throw new BadRequestException('Thiếu tệp ảnh.');

    const mimeType = sniffImageType(input.buffer);
    if (!mimeType) throw new BadRequestException(ATTACHMENT_BAD_TYPE_MESSAGE);

    if (
      !Types.ObjectId.isValid(input.siteId) ||
      !Types.ObjectId.isValid(input.ownerId) ||
      (input.conversationId != null && !Types.ObjectId.isValid(input.conversationId))
    ) {
      throw new BadRequestException('Yêu cầu không hợp lệ.');
    }

    const key = `attachments/${input.siteId}/${randomUUID()}.${ATTACHMENT_EXTENSIONS[mimeType]}`;
    const url = await this.storage.put(key, input.buffer, mimeType);

    let upload: UploadDocument;
    try {
      upload = await this.uploadModel.create({
        key,
        url,
        mimeType,
        size,
        width: dimension(input.width),
        height: dimension(input.height),
        name: displayName(input.name),
        siteId: new Types.ObjectId(input.siteId),
        ownerKind: input.ownerKind,
        ownerId: new Types.ObjectId(input.ownerId),
        conversationId: input.conversationId ? new Types.ObjectId(input.conversationId) : null,
        usedAt: null,
      });
    } catch (error) {
      // No row points at the object, so nothing would ever clean it up.
      await this.storage.delete(key).catch(() => false);
      throw error;
    }

    return toAttachmentView(upload);
  }
}
