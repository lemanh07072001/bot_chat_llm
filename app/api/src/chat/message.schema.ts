import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

export type MessageSenderKind = 'visitor' | 'agent' | 'system';

/** Who left a reaction; the id is a Visitor or a User. */
export type ReactionKind = 'visitor' | 'agent';

export const MESSAGE_MAX_LENGTH = 4000;

/**
 * One glyph, not a codepoint list: both clients send whatever the person picked,
 * including ZWJ sequences, so a single-code-point limit would corrupt families
 * and flags. The cap only exists to reject abuse.
 */
export const REACTION_MAX_LENGTH = 32;

@Schema({ _id: false })
export class MessageReaction {
  @Prop({ type: String, required: true, trim: true, maxlength: REACTION_MAX_LENGTH })
  emoji!: string;

  @Prop({ type: String, required: true, enum: ['visitor', 'agent'] })
  kind!: ReactionKind;

  @Prop({ type: Types.ObjectId, required: true })
  reactorId!: Types.ObjectId;
}

export const MessageReactionSchema = SchemaFactory.createForClass(MessageReaction);

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

  /**
   * At most one per person per message: a different emoji replaces the previous
   * one, the same emoji removes it. ChatService enforces that with a single
   * atomic update, since a unique index cannot span this subdocument tuple.
   */
  @Prop({ type: [MessageReactionSchema], default: [] })
  reactions?: MessageReaction[];

  /** Idempotency key for externally received Telegram replies. */
  @Prop({ type: String }) externalId?: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

/**
 * The only shape reactions leave the api in. The raw subdocument carries
 * `reactorId`, which is meaningless to both clients, and a whitelist keeps a
 * later schema change from leaking into the wire format by accident.
 *
 * Clients derive "mine" by comparing `id` with their own visitor or user id —
 * the same payload therefore serves the visitor and every agent.
 */
export function serializeReactions(
  reactions: unknown,
): Array<{ emoji: string; kind: ReactionKind; id: string }> {
  if (!Array.isArray(reactions)) return [];

  return reactions.flatMap((entry) => {
    const reaction = entry as { emoji?: unknown; kind?: unknown; reactorId?: unknown };
    const emoji = typeof reaction.emoji === 'string' ? reaction.emoji : '';
    const kind = reaction.kind === 'agent' ? 'agent' : reaction.kind === 'visitor' ? 'visitor' : null;
    const reactorId = reaction.reactorId;

    if (!emoji || !kind || !reactorId) return [];

    return [{ emoji, kind, id: String(reactorId) }];
  });
}

// Thread reads are always "this conversation, in order".
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ siteId: 1, createdAt: 1, _id: 1 });
MessageSchema.index({ externalId: 1 }, { unique: true, sparse: true });

MessageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const {
      _id,
      __v,
      conversationId,
      siteId: _siteId,
      externalId: _externalId,
      senderId,
      reactions,
      ...rest
    } = ret;
    return {
      id: String(_id),
      conversationId: String(conversationId),
      senderId: senderId ? String(senderId) : null,
      reactions: serializeReactions(reactions),
      ...rest,
    };
  },
});
