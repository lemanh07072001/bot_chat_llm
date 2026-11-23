import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { NotificationKind, NotificationView } from './notifications.types.js';

export type NotificationDocument = HydratedDocument<Notification>;

/** Bells older than this are of no use to anyone; Mongo drops them for us. */
export const NOTIFICATION_TTL_SECONDS = 30 * 24 * 60 * 60;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Site', required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', default: null })
  conversationId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Ticket', default: null })
  ticketId?: Types.ObjectId | null;

  @Prop({
    type: String,
    required: true,
    enum: [
      'conversation_new',
      'assigned',
      'contact_left',
      'missed',
      'ticket_new',
      'ticket_assigned',
    ],
  })
  kind!: NotificationKind;

  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, maxlength: 500 })
  body!: string;

  @Prop({ type: Date, default: null })
  readAt?: Date | null;

  /**
   * What makes a bell write idempotent: two processes racing over the same
   * visitor message both try to insert, and exactly one wins.
   */
  @Prop({ required: true })
  dedupeKey!: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// The bell list, newest first, one page at a time.
NotificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
// The dedupe guard. Unique per person, so the same event cannot double up even
// when two processes handle it at once.
NotificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
// Expiry rather than a cleanup job: an unread bell from a month ago is noise.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

export function toNotificationView(doc: NotificationDocument): NotificationView {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    conversationId: doc.conversationId ? String(doc.conversationId) : null,
    ticketId: doc.ticketId ? String(doc.ticketId) : null,
    kind: doc.kind,
    title: doc.title,
    body: doc.body,
    readAt: doc.readAt ? doc.readAt.toISOString() : null,
    createdAt: doc.get('createdAt').toISOString(),
  };
}

NotificationSchema.set('toJSON', {
  // One shape leaves the api: the client never sees dedupe keys or user ids.
  transform: (doc) => toNotificationView(doc as unknown as NotificationDocument),
});
