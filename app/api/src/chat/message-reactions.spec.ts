import { Types, model, models } from 'mongoose';
import {
  Message,
  MessageSchema,
  serializeReactions,
} from './message.schema.js';

/**
 * The wire format is a contract with two clients, so it is pinned here rather
 * than left to the shape of the subdocument.
 */
const MessageModel =
  models.MessageReactionSpec ??
  model<Message>('MessageReactionSpec', MessageSchema);

function build(reactions?: unknown, extra: Record<string, unknown> = {}) {
  return new MessageModel({
    conversationId: new Types.ObjectId(),
    siteId: new Types.ObjectId(),
    senderKind: 'visitor',
    senderName: 'Khách',
    body: 'xin chào',
    ...(reactions === undefined ? {} : { reactions }),
    ...extra,
  }).toJSON() as Record<string, unknown>;
}

describe('message reactions', () => {
  it('serialises one entry per person without the raw reactor id field', () => {
    const visitorId = new Types.ObjectId();
    const agentId = new Types.ObjectId();
    const json = build([
      { emoji: '👍', kind: 'visitor', reactorId: visitorId },
      { emoji: '🎉', kind: 'agent', reactorId: agentId },
    ]);

    expect(json.reactions).toEqual([
      { emoji: '👍', kind: 'visitor', id: String(visitorId) },
      { emoji: '🎉', kind: 'agent', id: String(agentId) },
    ]);
    // Nothing else from the subdocument may ride along.
    expect(JSON.stringify(json.reactions)).not.toContain('reactorId');
  });

  it('defaults to an empty list, so a message from before reactions still parses', () => {
    expect(build().reactions).toEqual([]);
  });

  it('drops entries it cannot attribute rather than exposing them', () => {
    expect(
      serializeReactions([
        { emoji: '👍', kind: 'visitor' },
        { kind: 'agent', reactorId: new Types.ObjectId() },
        { emoji: '😂', kind: 'someone', reactorId: new Types.ObjectId() },
        { emoji: '❤️', kind: 'visitor', reactorId: new Types.ObjectId() },
      ]),
    ).toHaveLength(1);
    expect(serializeReactions(undefined)).toEqual([]);
    expect(serializeReactions('nope')).toEqual([]);
  });

  it('keeps the conversation, sender and body on the wire', () => {
    const json = build([]);
    expect(typeof json.id).toBe('string');
    expect(typeof json.conversationId).toBe('string');
    expect(json.body).toBe('xin chào');
    expect(json.senderKind).toBe('visitor');
    // Internal fields stay internal.
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.siteId).toBeUndefined();
  });
});
