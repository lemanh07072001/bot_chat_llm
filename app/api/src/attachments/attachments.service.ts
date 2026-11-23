import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Upload, UploadDocument } from './upload.schema.js';
import {
  MAX_ATTACHMENTS,
  type AttachmentOwnerKind,
  type AttachmentView,
} from './attachment.types.js';

/**
 * Turns uploaded images into message/ticket attachments.
 *
 * MONGO ONLY: the realtime service copies this file, so it must never import
 * storage (aws-sdk, fs) or config.
 */
export interface AttachmentOwner {
  kind: AttachmentOwnerKind;
  /** Visitor id or User id. */
  id: string;
  siteId: string;
  /** Required for visitors: their uploads only attach to their own thread. */
  conversationId?: string;
}

export const TOO_MANY_ATTACHMENTS_MESSAGE = 'Tối đa 5 ảnh mỗi lần gửi.';
export const INVALID_ATTACHMENT_MESSAGE = 'Ảnh không hợp lệ hoặc đã được dùng.';

export function toAttachmentView(upload: {
  _id: unknown;
  url: string;
  mimeType: AttachmentView['mimeType'];
  size: number;
  width?: number | null;
  height?: number | null;
  name?: string | null;
}): AttachmentView {
  return {
    id: String(upload._id),
    url: upload.url,
    mimeType: upload.mimeType,
    size: upload.size,
    width: upload.width ?? null,
    height: upload.height ?? null,
    name: upload.name ?? null,
  };
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
  ) {}

  /**
   * Marks the uploads as used by the caller and returns them in input order
   * (duplicates dropped). All or nothing: if one id cannot be claimed, the
   * ones already claimed are released before the error is thrown.
   */
  async claim(
    ids: string[] | undefined | null,
    owner: AttachmentOwner,
  ): Promise<AttachmentView[]> {
    return (await this.claimWithStamp(ids, owner)).attachments;
  }

  /**
   * `claim`, plus the `usedAt` stamp this call wrote. Pass it to `release` so
   * a release only ever undoes this exact claim, never a later one.
   */
  async claimWithStamp(
    ids: string[] | undefined | null,
    owner: AttachmentOwner,
  ): Promise<{ attachments: AttachmentView[]; claimedAt: Date }> {
    const now = new Date();

    if (!ids || ids.length === 0) return { attachments: [], claimedAt: now };

    const unique = [...new Set(ids)];

    if (unique.length > MAX_ATTACHMENTS) {
      throw new BadRequestException(TOO_MANY_ATTACHMENTS_MESSAGE);
    }

    const ownerValid =
      Types.ObjectId.isValid(owner.id) &&
      Types.ObjectId.isValid(owner.siteId) &&
      (owner.kind !== 'visitor' ||
        (!!owner.conversationId &&
          Types.ObjectId.isValid(owner.conversationId)));

    if (
      !ownerValid ||
      unique.some((id) => typeof id !== 'string' || !Types.ObjectId.isValid(id))
    ) {
      throw new BadRequestException(INVALID_ATTACHMENT_MESSAGE);
    }

    const claimed: AttachmentView[] = [];

    try {
      for (const id of unique) {
        const upload = await this.uploadModel
          .findOneAndUpdate(
            {
              _id: new Types.ObjectId(id),
              ownerKind: owner.kind,
              ownerId: new Types.ObjectId(owner.id),
              siteId: new Types.ObjectId(owner.siteId),
              usedAt: null,
              ...(owner.kind === 'visitor'
                ? { conversationId: new Types.ObjectId(owner.conversationId) }
                : {}),
            },
            { $set: { usedAt: now } },
            { returnDocument: 'after' },
          )
          .exec();

        if (!upload) throw new BadRequestException(INVALID_ATTACHMENT_MESSAGE);

        claimed.push(toAttachmentView(upload));
      }
    } catch (error) {
      await this.release(claimed.map((view) => view.id), now).catch(() => undefined);
      throw error;
    }

    return { attachments: claimed, claimedAt: now };
  }

  /**
   * Makes claimed uploads attachable again (the write that used them failed).
   * With `claimedAt`, only rows still carrying that exact claim are touched.
   */
  async release(ids: string[], claimedAt?: Date): Promise<void> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));

    if (valid.length === 0) return;

    await this.uploadModel
      .updateMany(
        {
          _id: { $in: valid.map((id) => new Types.ObjectId(id)) },
          ...(claimedAt ? { usedAt: claimedAt } : {}),
        },
        { $set: { usedAt: null } },
      )
      .exec();
  }
}
