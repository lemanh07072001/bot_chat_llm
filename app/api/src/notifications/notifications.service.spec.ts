import { Types } from 'mongoose';
import { vi } from 'vitest';
import type { ConversationDocument } from '../chat/conversation.schema.js';
import type { VisitorDocument } from '../chat/visitor.schema.js';
import { NotificationsService } from './notifications.service.js';
import {
  NOTIFICATION_TITLES,
  inboxUrl,
  type NotificationView,
} from './notifications.types.js';

const USER_A = new Types.ObjectId('507f1f77bcf86cd799440101');
const USER_B = new Types.ObjectId('507f1f77bcf86cd799440102');
const SITE_ID = new Types.ObjectId('507f1f77bcf86cd799440103');
const CONVERSATION_ID = new Types.ObjectId('507f1f77bcf86cd799440104');
const VISITOR_ID = new Types.ObjectId('507f1f77bcf86cd799440105');
const MESSAGE_ID = '507f1f77bcf86cd799440106';
const CREATED_AT = new Date('2026-05-01T10:00:00.000Z');

/** A Mongoose query, reduced to the chain these tests reach. */
function query<T>(value: T) {
  const q = { exec: () => Promise.resolve(value) };

  return q;
}

/**
 * What `create()` hands back: a document with the fields `toNotificationView`
 * reads, plus `get('createdAt')` for the timestamps plugin.
 */
function createdDoc(data: Record<string, unknown>) {
  const fields: Record<string, unknown> = {
    _id: new Types.ObjectId(),
    readAt: null,
    get: (key: string) => (key === 'createdAt' ? CREATED_AT : fields[key]),
    ...data,
  };

  return fields;
}

function conversation(
  overrides: Partial<Record<string, unknown>> = {},
): ConversationDocument {
  const fields: Record<string, unknown> = {
    _id: CONVERSATION_ID,
    siteId: SITE_ID,
    visitorId: VISITOR_ID,
    assignedAgentId: null,
    ...overrides,
  };

  return {
    ...fields,
    get: (key: string) =>
      key === 'updatedAt' ? new Date('2026-05-01T09:00:00.000Z') : fields[key],
  } as unknown as ConversationDocument;
}

function harness() {
  const notifications = { create: vi.fn() };
  const visitors = { findById: vi.fn((): { exec: () => Promise<unknown> } => query(null)) };
  const recipients = {
    forConversationInScope: vi.fn(),
    forAssignment: vi.fn(),
    assignedAgentIdOf: vi.fn(() => null),
  };
  const bus = { emitToUser: vi.fn() };
  const push = { sendToUser: vi.fn().mockResolvedValue(undefined) };

  const service = new NotificationsService(
    notifications as never,
    visitors as never,
    recipients as never,
    bus as never,
    push as never,
  );

  return { service, notifications, visitors, recipients, bus, push };
}

const input = {
  userId: String(USER_A),
  projectId: String(SITE_ID),
  conversationId: String(CONVERSATION_ID),
  kind: 'assigned' as const,
  body: 'Khách vừa được giao cho bạn.',
  dedupeKey: 'assigned:conv:user:1',
};

describe('NotificationsService.createOnce', () => {
  it('treats a duplicate key as "already recorded": no bell, no emit, no push', async () => {
    const h = harness();
    h.notifications.create.mockRejectedValue({ code: 11000 });

    expect(await h.service.createOnce(input)).toBeNull();

    expect(h.notifications.create).toHaveBeenCalledTimes(1);
    expect(h.bus.emitToUser).not.toHaveBeenCalled();
    expect(h.push.sendToUser).not.toHaveBeenCalled();
  });

  it('rethrows anything that is not a duplicate key', async () => {
    const h = harness();
    h.notifications.create.mockRejectedValue(new Error('mongo down'));

    await expect(h.service.createOnce(input)).rejects.toThrow('mongo down');

    expect(h.bus.emitToUser).not.toHaveBeenCalled();
    expect(h.push.sendToUser).not.toHaveBeenCalled();
  });

  it('announces and pushes a row that actually landed', async () => {
    const h = harness();
    h.notifications.create.mockImplementation(async (data: Record<string, unknown>) =>
      createdDoc(data),
    );

    const view = await h.service.createOnce(input);

    expect(view).not.toBeNull();
    expect(h.bus.emitToUser).toHaveBeenCalledWith(
      String(USER_A),
      'notification:new',
      expect.objectContaining({ kind: 'assigned' }),
    );
    expect(h.push.sendToUser).toHaveBeenCalledTimes(1);
    expect(h.push.sendToUser.mock.calls[0][1]).toMatchObject({
      title: NOTIFICATION_TITLES.assigned,
      data: { url: inboxUrl(String(CONVERSATION_ID)) },
    });
  });
});

describe('NotificationsService.notifyTicket', () => {
  it('rings each unique user once, deep links to the ticket and survives a per-user failure', async () => {
    const h = harness();
    const ticketId = '507f1f77bcf86cd799440107';
    h.notifications.create
      .mockRejectedValueOnce(new Error('mongo down'))
      .mockImplementation(async (data: Record<string, unknown>) => createdDoc(data));

    await expect(
      h.service.notifyTicket({
        userIds: [String(USER_A), String(USER_B), String(USER_A)],
        kind: 'ticket_new',
        projectId: String(SITE_ID),
        conversationId: String(CONVERSATION_ID),
        ticketId,
        body: 'Ticket #1',
      }),
    ).resolves.toBeUndefined();

    expect(h.notifications.create).toHaveBeenCalledTimes(2);
    expect(h.notifications.create.mock.calls[1][0]).toMatchObject({
      userId: USER_B,
      ticketId: new Types.ObjectId(ticketId),
      kind: 'ticket_new',
      title: NOTIFICATION_TITLES.ticket_new,
      dedupeKey: `ticket_new:${ticketId}:${String(USER_B)}`,
    });
    expect(h.bus.emitToUser).toHaveBeenCalledWith(
      String(USER_B),
      'notification:new',
      expect.objectContaining({ ticketId, kind: 'ticket_new' }),
    );
    expect(h.push.sendToUser).toHaveBeenCalledTimes(1);
    expect(h.push.sendToUser.mock.calls[0][1]).toMatchObject({
      data: { url: `/tickets?ticket=${ticketId}` },
    });
  });
});

describe('NotificationsService.onAssignment', () => {
  it('says nothing about self-assignment, an unchanged holder, or nobody', async () => {
    const h = harness();
    h.recipients.forAssignment.mockResolvedValue([{ _id: USER_A }]);
    h.notifications.create.mockImplementation(async (data: Record<string, unknown>) =>
      createdDoc(data),
    );

    const holder = String(USER_A);

    // Claiming your own work must never ring your own bell.
    expect(
      await h.service.onAssignment({
        actorId: holder,
        previousAgentId: null,
        nextAgentId: holder,
        conversation: conversation(),
      }),
    ).toBeNull();

    // Re-assigning to whoever already holds it is not a new event.
    expect(
      await h.service.onAssignment({
        actorId: String(USER_B),
        previousAgentId: holder,
        nextAgentId: holder,
        conversation: conversation({ assignedAgentId: USER_A }),
      }),
    ).toBeNull();

    // Unassigned is not an event either.
    expect(
      await h.service.onAssignment({
        actorId: String(USER_B),
        previousAgentId: holder,
        nextAgentId: null,
        conversation: conversation(),
      }),
    ).toBeNull();

    expect(h.recipients.forAssignment).not.toHaveBeenCalled();
    expect(h.notifications.create).not.toHaveBeenCalled();
  });

  it('compares ids as strings, so an ObjectId previous holder is not a handover to the same person', async () => {
    const h = harness();
    h.recipients.forAssignment.mockResolvedValue([{ _id: USER_B }]);
    h.notifications.create.mockImplementation(async (data: Record<string, unknown>) =>
      createdDoc(data),
    );

    // The actor and the previous holder arrive as ObjectIds from a document;
    // the new holder is the string from the request.
    expect(
      await h.service.onAssignment({
        actorId: String(USER_B),
        previousAgentId: USER_B as unknown as string,
        nextAgentId: String(USER_B),
        conversation: conversation({ assignedAgentId: USER_A }),
      }),
    ).toBeNull();

    expect(
      await h.service.onAssignment({
        actorId: USER_B as unknown as string,
        previousAgentId: String(USER_B),
        nextAgentId: String(USER_B),
        conversation: conversation({ assignedAgentId: USER_A }),
      }),
    ).toBeNull();

    // Same ids on both sides means "unchanged", not "hand it over again".
    expect(
      await h.service.onAssignment({
        actorId: String(USER_A),
        previousAgentId: USER_B as unknown as string,
        nextAgentId: String(USER_B),
        conversation: conversation({ assignedAgentId: USER_B }),
      }),
    ).toBeNull();

    expect(h.notifications.create).not.toHaveBeenCalled();
  });

  it('rings the new holder once, keyed by thread, person and handover time', async () => {
    const h = harness();
    h.recipients.forAssignment.mockResolvedValue([{ _id: USER_B }]);
    h.notifications.create.mockImplementation(async (data: Record<string, unknown>) =>
      createdDoc(data),
    );

    const assignedAt = new Date('2026-05-01T09:30:00.000Z');

    await h.service.onAssignment({
      actorId: String(USER_A),
      previousAgentId: String(USER_A),
      nextAgentId: String(USER_B),
      conversation: conversation({ assignedAgentId: USER_B }),
      assignedAt,
    });

    expect(h.recipients.forAssignment).toHaveBeenCalledWith(String(USER_B));
    expect(h.notifications.create).toHaveBeenCalledTimes(1);
    // Stored as ObjectIds, not the strings that arrive over the wire.
    expect(h.notifications.create.mock.calls[0][0]).toMatchObject({
      userId: USER_B,
      projectId: SITE_ID,
      conversationId: CONVERSATION_ID,
      kind: 'assigned',
      dedupeKey: `assigned:${String(CONVERSATION_ID)}:${String(USER_B)}:${assignedAt.getTime()}`,
    });
  });
});

describe('NotificationsService.onVisitorMessage', () => {
  function harnessWithRecipients() {
    const h = harness();
    h.recipients.forConversationInScope.mockResolvedValue([
      { _id: USER_A },
      { _id: USER_B },
    ]);
    h.visitors.findById.mockReturnValue(query({ name: 'An' } as VisitorDocument));
    h.notifications.create.mockImplementation(async (data: Record<string, unknown>) =>
      createdDoc(data),
    );

    return h;
  }

  const message = {
    conversation: conversation(),
    messageId: MESSAGE_ID,
    preview: 'shop ơi',
    createdAt: CREATED_AT,
  };

  it('a mid-thread message makes no bell and pushes one per recipient with the per-message title', async () => {
    const h = harnessWithRecipients();

    await h.service.onVisitorMessage(message);

    expect(h.notifications.create).not.toHaveBeenCalled();
    expect(h.push.sendToUser).toHaveBeenCalledTimes(2);
    expect(h.push.sendToUser.mock.calls.map((call) => call[0])).toEqual([
      String(USER_A),
      String(USER_B),
    ]);

    const payload = h.push.sendToUser.mock.calls[0][1];
    expect(payload.title).toBe('Tin nhắn mới · An');
    expect(payload.body).toBe('shop ơi');
    expect(payload.tag).toBe(String(CONVERSATION_ID));
    expect(payload.data).toEqual({ url: inboxUrl(String(CONVERSATION_ID)) });
  });

  it('emits notification:message to every in-scope recipient', async () => {
    const h = harnessWithRecipients();

    await h.service.onVisitorMessage({ ...message, startsConversation: true });

    const events = h.bus.emitToUser.mock.calls.filter(
      (call) => call[1] === 'notification:message',
    );

    expect(events).toHaveLength(2);
    expect(events.map((call) => call[0])).toEqual([
      String(USER_A),
      String(USER_B),
    ]);

    for (const [, , event] of events) {
      expect(event).toMatchObject({
        messageId: MESSAGE_ID,
        conversationId: String(CONVERSATION_ID),
        projectId: String(SITE_ID),
        visitorLabel: 'An',
        preview: 'shop ơi',
        createdAt: CREATED_AT.toISOString(),
      });
    }
  });

  it('a thread-opening message creates conversation_new and pushes once, with the bell wording', async () => {
    const h = harnessWithRecipients();

    await h.service.onVisitorMessage({ ...message, startsConversation: true });
    await Promise.resolve();

    // One bell per recipient, written with its own push suppressed.
    expect(h.notifications.create).toHaveBeenCalledTimes(2);
    expect(h.notifications.create.mock.calls[0][0]).toMatchObject({
      kind: 'conversation_new',
      dedupeKey: `conv_new:${MESSAGE_ID}`,
    });

    // Exactly one push per person: the new-thread one, not a second per-message.
    expect(h.push.sendToUser).toHaveBeenCalledTimes(2);
    const [userId, payload] = h.push.sendToUser.mock.calls[0];
    expect(userId).toBe(String(USER_A));
    expect(payload.title).toBe(NOTIFICATION_TITLES.conversation_new);
    expect(payload.body).toBe('An vừa bắt đầu một cuộc trò chuyện mới.');
  });

  it('carries the bell id on the message event so a click can mark it read', async () => {
    const h = harnessWithRecipients();

    await h.service.onVisitorMessage({ ...message, startsConversation: true });

    const [, , event] = h.bus.emitToUser.mock.calls.find(
      (call) => call[1] === 'notification:message',
    )!;

    expect((event as { notificationId?: string }).notificationId).toBeDefined();
  });

  it('swallows a bell failure: the message event still goes out and nothing throws', async () => {
    const h = harnessWithRecipients();
    h.notifications.create.mockRejectedValue(new Error('mongo down'));

    await expect(
      h.service.onVisitorMessage({ ...message, startsConversation: true }),
    ).resolves.toBeUndefined();

    expect(h.notifications.create).toHaveBeenCalledTimes(2);
    expect(h.bus.emitToUser).toHaveBeenCalledTimes(2);
    // A bell that did not land must not buzz a phone either.
    expect(h.push.sendToUser).not.toHaveBeenCalled();
    const event = h.bus.emitToUser.mock.calls[0][2] as NotificationView & {
      notificationId?: string;
    };
    expect(event.notificationId).toBeUndefined();
  });

  it('does nothing when nobody is in scope', async () => {
    const h = harness();
    h.recipients.forConversationInScope.mockResolvedValue([]);

    await h.service.onVisitorMessage(message);

    expect(h.notifications.create).not.toHaveBeenCalled();
    expect(h.push.sendToUser).not.toHaveBeenCalled();
    expect(h.bus.emitToUser).not.toHaveBeenCalled();
  });
});
