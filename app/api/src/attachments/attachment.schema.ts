import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_NAME_MAX_LENGTH,
  type AttachmentMimeType,
} from './attachment.types.js';

/**
 * Embedded copy of a claimed upload, stored on messages, tickets and ticket
 * replies so reading a thread never needs the `uploads` collection. `id` is
 * the upload's id.
 */
@Schema({ _id: false })
export class AttachmentSubdoc {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  url!: string;

  @Prop({ type: String, required: true, enum: [...ATTACHMENT_MIME_TYPES] })
  mimeType!: AttachmentMimeType;

  @Prop({ type: Number, required: true, min: 0 })
  size!: number;

  @Prop({ type: Number, default: null })
  width!: number | null;

  @Prop({ type: Number, default: null })
  height!: number | null;

  @Prop({ type: String, default: null, maxlength: ATTACHMENT_NAME_MAX_LENGTH })
  name!: string | null;
}

export const AttachmentSubdocSchema = SchemaFactory.createForClass(AttachmentSubdoc);
