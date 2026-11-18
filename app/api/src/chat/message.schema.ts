import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

export type MessageSenderKind = 'visitor' | 'agent' | 'system';

export const MESSAGE_MAX_LENGTH = 4000;

/** A translation of a 4000-character message can grow; leave room. */
const TRANSLATION_MAX_LENGTH = MESSAGE_MAX_LENGTH * 2;

@Schema({ _id: false })
export class MessageTranslation {
  /** Target language code, e.g. `vi`. One entry per language. */
  @Prop({ required: true, trim: true, maxlength: 8 })
  lang!: string;

  @Prop({ required: true, trim: true, maxlength: TRANSLATION_MAX_LENGTH })
  text!: string;

  /** Which model produced it, so the panel can say what did the work. */
  @Prop({ trim: true, maxlength: 100 })
  model?: string;

  @Prop({ type: Date, default: () => new Date() })
  at?: Date;
}

export const MessageTranslationSchema =
  SchemaFactory.createForClass(MessageTranslation);


@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Site', required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['visitor', 'agent', 'system'] })
  senderKind!: MessageSenderKind;

  /** Visitor or User id; null for system messages. */
  @Prop({ type: Types.ObjectId, default: null })
  senderId?: Types.ObjectId | null;

  @Prop({ trim: true, maxlength: 100 })
  senderName?: string;

  @Prop({ required: true, trim: true, maxlength: MESSAGE_MAX_LENGTH })
  body!: string;

  /** Idempotency key for externally received Telegram replies. */
  @Prop({ type: String }) externalId?: string;

  /**
   * Machine translations of `body`, one entry per target language.
   *
   * Stored on the message rather than in a cache so a thread reads the same
   * tomorrow, and so two agents looking at it do not each pay for a call.
   */
  @Prop({ type: [MessageTranslationSchema], default: undefined })
  translations?: MessageTranslation[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Thread reads are always "this conversation, in order".
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ siteId: 1, createdAt: 1, _id: 1 });
MessageSchema.index({ externalId: 1 }, { unique: true, sparse: true });

MessageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v, conversationId, siteId: _siteId, externalId: _externalId, senderId, ...rest } = ret;
    return {
      id: String(_id),
      conversationId: String(conversationId),
      senderId: senderId ? String(senderId) : null,
      ...rest,
    };
  },
});
