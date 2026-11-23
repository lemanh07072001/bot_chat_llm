import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_NAME_MAX_LENGTH,
  type AttachmentMimeType,
  type AttachmentOwnerKind,
} from './attachment.types.js';

export type UploadDocument = HydratedDocument<Upload>;

/**
 * A stored image waiting to be attached. It becomes part of a message, ticket
 * or reply exactly once (`usedAt`), and only for the person who uploaded it.
 */
@Schema({ timestamps: true, collection: 'uploads' })
export class Upload {
  /** Storage key (R2 object key or local filename). */
  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  url!: string;

  @Prop({ type: String, required: true, enum: [...ATTACHMENT_MIME_TYPES] })
  mimeType!: AttachmentMimeType;

  @Prop({ type: Number, required: true, min: 1 })
  size!: number;

  @Prop({ type: Number, default: null })
  width!: number | null;

  @Prop({ type: Number, default: null })
  height!: number | null;

  @Prop({ type: String, default: null, maxlength: ATTACHMENT_NAME_MAX_LENGTH })
  name!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Site', required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['visitor', 'agent'] })
  ownerKind!: AttachmentOwnerKind;

  /** Visitor id or User id. */
  @Prop({ type: Types.ObjectId, required: true })
  ownerId!: Types.ObjectId;

  /** Visitor uploads are pinned to the conversation of their token. */
  @Prop({ type: Types.ObjectId, default: null })
  conversationId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  usedAt!: Date | null;
}

export const UploadSchema = SchemaFactory.createForClass(Upload);

UploadSchema.index({ ownerKind: 1, ownerId: 1, usedAt: 1 });
/** The api's sweep of uploads never attached (`usedAt: null`, old `createdAt`). */
UploadSchema.index({ usedAt: 1, createdAt: 1 });
