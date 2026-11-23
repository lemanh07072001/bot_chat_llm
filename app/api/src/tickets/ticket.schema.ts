import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TICKET_STATUSES, type TicketStatus } from './tickets.types.js';
import { AttachmentSubdoc, AttachmentSubdocSchema } from '../attachments/attachment.schema.js';

export type TicketDocument = HydratedDocument<Ticket>;

@Schema({ _id: false })
export class TicketReply {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 100 })
  authorName!: string;

  /** May be '' when the reply is images only. */
  @Prop({ type: String, default: '', maxlength: 4000 })
  body!: string;

  @Prop({ type: [AttachmentSubdocSchema], default: [] })
  attachments!: AttachmentSubdoc[];

  @Prop({ type: Date, required: true, default: () => new Date() })
  createdAt!: Date;
}

export const TicketReplySchema = SchemaFactory.createForClass(TicketReply);

@Schema({ timestamps: true })
export class Ticket {
  /** Human-facing "#123", taken from the `counters` collection. */
  @Prop({ required: true, unique: true })
  number!: number;

  @Prop({ type: Types.ObjectId, ref: 'Site', required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visitor', required: true })
  visitorId!: Types.ObjectId;

  @Prop({ type: String, default: null, maxlength: 100 })
  name?: string | null;

  @Prop({ required: true, maxlength: 200 })
  email!: string;

  @Prop({ required: true, maxlength: 2000 })
  message!: string;

  @Prop({ type: [AttachmentSubdocSchema], default: [] })
  attachments!: AttachmentSubdoc[];

  @Prop({ type: String, required: true, enum: TICKET_STATUSES, default: 'new' })
  status!: TicketStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assigneeId?: Types.ObjectId | null;

  @Prop({ type: [TicketReplySchema], default: [] })
  replies!: TicketReply[];

  /** Filled by `timestamps: true`; declared for typing only. */
  createdAt!: Date;
  updatedAt!: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

TicketSchema.index({ siteId: 1 });
TicketSchema.index({ assigneeId: 1, status: 1 });
TicketSchema.index({ createdAt: -1 });

/** One sequence per `_id` ('ticket'), bumped atomically with $inc + upsert. */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true, default: 0 })
  seq!: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
