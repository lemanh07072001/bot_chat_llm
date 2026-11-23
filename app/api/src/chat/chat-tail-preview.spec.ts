import { Types } from 'mongoose';
import { vi } from 'vitest';
import { ChatService } from './chat.service.js';

/**
 * The conversation tail is written with an update *pipeline*, where a bare
 * string starting with `$` is an expression rather than text. The preview is
 * whatever the visitor typed, so it must be wrapped in `$literal`.
 */
const CONVERSATION_ID = '507f1f77bcf86cd799440201';
const SITE_ID = '507f1f77bcf86cd799440202';
const CREATED_AT = new Date('2026-05-01T10:00:00.000Z');

function harness() {
  const messageModel = {
    findOne: vi.fn(),
    create: vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      get: () => CREATED_AT,
    }),
  };
  const conversationModel = {
    findOneAndUpdate: vi.fn(() => ({ exec: async () => null })),
  };
  const visitorModel = {};

  const service = new ChatService(
    visitorModel as never,
    conversationModel as never,
    messageModel as never,
  );

  return { service, conversationModel };
}

function pipelineOf(conversationModel: { findOneAndUpdate: ReturnType<typeof vi.fn> }) {
  const [, update] = conversationModel.findOneAndUpdate.mock.calls[0];

  return update as Array<{ $set: Record<string, unknown> }>;
}

describe('ChatService.appendMessage conversation tail', () => {
  it('stores a preview that starts with "$" as text, not as an expression', async () => {
    const h = harness();

    await h.service.appendMessage({
      conversationId: CONVERSATION_ID,
      siteId: SITE_ID,
      senderKind: 'visitor',
      body: '$100 giảm giá',
    });

    expect(pipelineOf(h.conversationModel)[0].$set).toMatchObject({
      lastMessagePreview: { $literal: '$100 giảm giá' },
      lastMessageSenderKind: { $literal: 'visitor' },
      // The real expressions still evaluate.
      unreadForAgent: { $add: [{ $ifNull: ['$unreadForAgent', 0] }, 1] },
      firstUnansweredAgentAt: null,
    });
  });

  it('wraps the preview for agent and system writes too', async () => {
    for (const senderKind of ['agent', 'system'] as const) {
      const h = harness();

      await h.service.appendMessage({
        conversationId: CONVERSATION_ID,
        siteId: SITE_ID,
        senderKind,
        body: '$body',
      });

      expect(pipelineOf(h.conversationModel)[0].$set.lastMessagePreview).toEqual({
        $literal: '$body',
      });
    }
  });
});
