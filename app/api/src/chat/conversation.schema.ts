import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

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
