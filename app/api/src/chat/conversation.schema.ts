import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { MessageSenderKind } from './message.schema.js';

export type ConversationDocument = HydratedDocument<Conversation>;

export type ConversationStatus = 'open' | 'closed';

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: Types.ObjectId, ref: 'Site', required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visitor', required: true })
  visitorId!: Types.ObjectId;

  // `type` is explicit because the TypeScript type is a union, which the
  // decorator cannot infer on its own.
  @Prop({ type: String, required: true, enum: ['open', 'closed'], default: 'open' })
  status!: ConversationStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedAgentId?: Types.ObjectId | null;

  @Prop({ required: true, default: Date.now })
  lastMessageAt!: Date;

  @Prop({ trim: true, maxlength: 200 })
  lastMessagePreview?: string;

  @Prop({ required: true, default: 0 })
  unreadForAgent!: number;

  /**
   * The tail of the thread, kept denormalised so the missed-chat scheduler can
   * answer "visitor is waiting" with one indexed query instead of reading
   * messages. Written by ChatService.appendMessage only.
   */
  @Prop({ type: String, enum: ['visitor', 'agent', 'system'], default: null })
  lastMessageSenderKind?: MessageSenderKind | null;

  @Prop({ type: Date, default: null })
  lastVisitorMessageAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastAgentMessageAt?: Date | null;

  /**
   * When the current unanswered streak began, i.e. the first agent message
   * after the visitor's last one. Cleared by the next visitor message.
   */
  @Prop({ type: Date, default: null })
  firstUnansweredAgentAt?: Date | null;

  /** Last time the visitor's widget told us the thread was open and visible. */
  @Prop({ type: Date, default: null })
  visitorLastReadAt?: Date | null;

  /** Streak marker: the "missed" bell/mail already fired for this wait. */
  @Prop({ type: Date, default: null })
  missedNotifiedAt?: Date | null;

  /** Streak marker: the visitor was already emailed about these replies. */
  @Prop({ type: Date, default: null })
  visitorEmailedAt?: Date | null;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Inbox listing: newest activity first, per site.
ConversationSchema.index({ siteId: 1, lastMessageAt: -1 });
// The inbox's status tabs ("đang mở" / "đã đóng") over the same scope.
ConversationSchema.index({ siteId: 1, status: 1, lastMessageAt: -1 });
// The "chờ phân công" and "của tôi" tabs.
ConversationSchema.index({ siteId: 1, assignedAgentId: 1, lastMessageAt: -1 });
// Reattaching a returning visitor to their open thread.
ConversationSchema.index({ visitorId: 1, status: 1 });
// The missed-chat scheduler: open threads whose tail is an unanswered visitor
// message, oldest wait first.
ConversationSchema.index({ status: 1, lastMessageSenderKind: 1, lastVisitorMessageAt: 1 });
// The visitor-reply mails: agent streaks that have not been mailed yet.
ConversationSchema.index({ status: 1, firstUnansweredAgentAt: 1, visitorEmailedAt: 1 });

ConversationSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v, siteId, visitorId, assignedAgentId, ...rest } = ret;
    return {
      id: String(_id),
      siteId: String(siteId),
      visitorId: String(visitorId),
      assignedAgentId: assignedAgentId ? String(assignedAgentId) : null,
      ...rest,
    };
  },
});
