import { Types } from 'mongoose';
import { vi } from 'vitest';
import { NotificationSchedulerService } from './notification-scheduler.service.js';
import { MailService } from '../mail/mail.service.js';

/**
 * The mails are the observable side of every rule here, so the transport is
 * captured rather than stubbed per call: `sent` holds exactly what would have
 * gone out, html included.
 */
const { sent } = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; subject: string; text: string; html?: string }>,
}));

vi.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: (message: { to: string; subject: string; text: string; html?: string }) => {
      sent.push(message);
      return Promise.resolve();
    },
  }),
}));

const NOW = new Date('2026-05-01T10:00:00.000Z');

/** A Mongoose query, reduced to the chain the service actually uses. */
function query<T>(value: T) {
  const q = {
    sort: () => q,
    limit: () => q,
    exec: () => Promise.resolve(value),
  };

  return q;
}

interface Harness {
  service: NotificationSchedulerService;
  conversations: { find: ReturnType<typeof vi.fn>; findOneAndUpdate: ReturnType<typeof vi.fn> };
  messages: { find: ReturnType<typeof vi.fn> };
  visitors: { findById: ReturnType<typeof vi.fn> };
  sites: { findById: ReturnType<typeof vi.fn>; accessFor: ReturnType<typeof vi.fn> };
  users: { findById: ReturnType<typeof vi.fn> };
  recipients: { forConversationInScope: ReturnType<typeof vi.fn> };
  notifications: { createOnce: ReturnType<typeof vi.fn> };
  redis: { isVisitorConnected: ReturnType<typeof vi.fn> };
  mail: { sendMissedChat: ReturnType<typeof vi.fn>; sendVisitorReplies: ReturnType<typeof vi.fn> };
}

function harness(): Harness {
  const conversations = { find: vi.fn(), findOneAndUpdate: vi.fn() };
  const messages = { find: vi.fn() };
  const visitors = { findById: vi.fn() };
  const sites = { findById: vi.fn(), accessFor: vi.fn() };
  const users = { findById: vi.fn() };
  const recipients = { forConversationInScope: vi.fn() };
  const notifications = { createOnce: vi.fn().mockResolvedValue({ id: 'n1' }) };
  const redis = { isVisitorConnected: vi.fn().mockResolvedValue(false) };
  const mail = {
    sendMissedChat: vi.fn().mockResolvedValue(undefined),
    sendVisitorReplies: vi.fn().mockResolvedValue(undefined),
  };

  const config = {
    get: (key: string) =>
      ({ MISSED_CHAT_MINUTES: '5', ADMIN_URL: 'http://admin.test' } as Record<string, string>)[
        key
      ],
  };

  sites.findById.mockResolvedValue({ name: 'Shop Áo' });
  sites.accessFor.mockResolvedValue('owner');

  const service = new NotificationSchedulerService(
    conversations as never,
    messages as never,
    visitors as never,
    config as never,
    sites as never,
    users as never,
    recipients as never,
    notifications as never,
    redis as never,
    mail as never,
  );

  return {
    service,
    conversations,
    messages,
    visitors,
    sites,
    users,
    recipients,
    notifications,
    redis,
    mail,
  };
}

const CONVERSATION_ID = new Types.ObjectId('507f1f77bcf86cd799440010');
const SITE_ID = new Types.ObjectId('507f1f77bcf86cd799440011');
const VISITOR_ID = new Types.ObjectId('507f1f77bcf86cd799440012');
const AGENT_ID = new Types.ObjectId('507f1f77bcf86cd799440013');

function waitingConversation(overrides: Record<string, unknown> = {}) {
  return {
    _id: CONVERSATION_ID,
    siteId: SITE_ID,
    visitorId: VISITOR_ID,
    status: 'open',
    assignedAgentId: AGENT_ID,
    lastMessageSenderKind: 'visitor',
    lastVisitorMessageAt: new Date('2026-05-01T09:50:00.000Z'),
    lastAgentMessageAt: new Date('2026-05-01T09:00:00.000Z'),
    missedNotifiedAt: null,
    firstUnansweredAgentAt: null,
    visitorLastReadAt: null,
    visitorEmailedAt: null,
    ...overrides,
  };
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    _id: AGENT_ID,
    name: 'Linh',
    email: 'linh@example.test',
    emailMissed: true,
    notifyScope: 'all',
    ...overrides,
  };
}

describe('NotificationSchedulerService.processMissedChats', () => {
  it('notifies once: a second sweep that loses the claim does nothing', async () => {
    const h = harness();
    const conversation = waitingConversation();

    h.conversations.find.mockReturnValue(query([conversation]));
    h.conversations.findOneAndUpdate
      .mockReturnValueOnce(query(waitingConversation({ missedNotifiedAt: NOW })))
      .mockReturnValueOnce(query(null));
    h.visitors.findById.mockReturnValue(query({ _id: VISITOR_ID, name: 'An' }));
    h.users.findById.mockResolvedValue(agent());
    h.messages.find.mockReturnValue(query([]));

    await h.service.processMissedChats(NOW);
    await h.service.processMissedChats(new Date(NOW.getTime() + 60_000));

    expect(h.notifications.createOnce).toHaveBeenCalledTimes(1);
    expect(h.notifications.createOnce).toHaveBeenCalledWith({
      userId: String(AGENT_ID),
      projectId: String(SITE_ID),
      conversationId: String(CONVERSATION_ID),
      kind: 'missed',
      body: 'An đã chờ 10 phút',
      dedupeKey: `missed:${String(CONVERSATION_ID)}:${new Date(
        '2026-05-01T09:50:00.000Z',
      ).getTime()}`,
    });
    // One mail for the whole wait, not one per sweep.
    expect(h.mail.sendMissedChat).toHaveBeenCalledTimes(1);
    expect(h.mail.sendMissedChat.mock.calls[0][0]).toMatchObject({
      to: 'linh@example.test',
      agentName: 'Linh',
      visitorLabel: 'An',
      siteName: 'Shop Áo',
      url: `http://admin.test/inbox?conversation=${String(CONVERSATION_ID)}`,
    });
  });

  it('still rings the bell for somebody who turned the mail off', async () => {
    const h = harness();

    h.conversations.find.mockReturnValue(query([waitingConversation()]));
    h.conversations.findOneAndUpdate.mockReturnValue(
      query(waitingConversation({ missedNotifiedAt: NOW })),
    );
    h.visitors.findById.mockReturnValue(query({ _id: VISITOR_ID, name: 'An' }));
    h.users.findById.mockResolvedValue(agent({ emailMissed: false }));
    h.messages.find.mockReturnValue(query([]));

    await h.service.processMissedChats(NOW);

    expect(h.notifications.createOnce).toHaveBeenCalledTimes(1);
    expect(h.mail.sendMissedChat).not.toHaveBeenCalled();
  });

  it('uses the scoped recipients when the holder lost access', async () => {
    const h = harness();

    h.conversations.find.mockReturnValue(query([waitingConversation()]));
    h.conversations.findOneAndUpdate.mockReturnValue(
      query(waitingConversation({ missedNotifiedAt: NOW })),
    );
    h.visitors.findById.mockReturnValue(query({ _id: VISITOR_ID }));
    h.users.findById.mockResolvedValue(agent());
    h.sites.accessFor.mockResolvedValue('none');
    h.recipients.forConversationInScope.mockResolvedValue([
      agent({ _id: new Types.ObjectId('507f1f77bcf86cd799440014'), name: 'Bình' }),
    ]);
    h.messages.find.mockReturnValue(query([]));

    await h.service.processMissedChats(NOW);

    expect(h.recipients.forConversationInScope).toHaveBeenCalled();
    expect(h.notifications.createOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '507f1f77bcf86cd799440014',
        body: expect.stringContaining('Khách'),
      }),
    );
  });

  it('quotes at most the visitor messages since the last agent reply', async () => {
    const h = harness();

    h.conversations.find.mockReturnValue(query([waitingConversation()]));
    h.conversations.findOneAndUpdate.mockReturnValue(
      query(waitingConversation({ missedNotifiedAt: NOW })),
    );
    h.visitors.findById.mockReturnValue(query({ _id: VISITOR_ID, email: 'an@example.test' }));
    h.users.findById.mockResolvedValue(agent());
    h.messages.find.mockReturnValue(
      query([
        { body: 'tin 2', createdAt: new Date('2026-05-01T09:50:00.000Z') },
        { body: 'tin 1', createdAt: new Date('2026-05-01T09:40:00.000Z') },
      ]),
    );

    await h.service.processMissedChats(NOW);

    // Newest five, and the query only looks at the visitor's own words.
    expect(h.messages.find).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      senderKind: 'visitor',
      createdAt: { $gt: new Date('2026-05-01T09:00:00.000Z') },
    });
    expect(h.mail.sendMissedChat.mock.calls[0][0].messages).toEqual([
      { text: 'tin 1', createdAt: new Date('2026-05-01T09:40:00.000Z') },
      { text: 'tin 2', createdAt: new Date('2026-05-01T09:50:00.000Z') },
    ]);
  });

  it('leaves a thread the visitor has already had answered alone', async () => {
    const h = harness();

    h.conversations.find.mockReturnValue(query([]));

    await h.service.processMissedChats(NOW);

    expect(h.conversations.find).toHaveBeenCalledWith({
      status: 'open',
      lastMessageSenderKind: 'visitor',
      lastVisitorMessageAt: { $lte: new Date('2026-05-01T09:55:00.000Z') },
      missedNotifiedAt: null,
    });
    expect(h.notifications.createOnce).not.toHaveBeenCalled();
  });
});

describe('NotificationSchedulerService.processVisitorReplies', () => {
  function streak(overrides: Record<string, unknown> = {}) {
    return waitingConversation({
      firstUnansweredAgentAt: new Date('2026-05-01T09:55:00.000Z'),
      lastVisitorMessageAt: new Date('2026-05-01T09:50:00.000Z'),
      visitorLastReadAt: null,
      visitorEmailedAt: null,
      ...overrides,
    });
  }

  function replies(h: Harness) {
    h.conversations.find.mockReturnValue(query([streak()]));
    h.visitors.findById.mockReturnValue(
      query({ _id: VISITOR_ID, email: 'khach@example.test' }),
    );
    h.messages.find.mockReturnValue(
      query([
        {
          body: 'Dạ em đây ạ',
          createdAt: new Date('2026-05-01T09:56:00.000Z'),
          senderName: 'Linh',
        },
      ]),
    );
  }

  it('defers when presence is unknown rather than guessing the visitor is offline', async () => {
    const h = harness();

    replies(h);
    h.redis.isVisitorConnected.mockResolvedValue(null);

    await h.service.processVisitorReplies(NOW);

    expect(h.conversations.findOneAndUpdate).not.toHaveBeenCalled();
    expect(h.mail.sendVisitorReplies).not.toHaveBeenCalled();
  });

  it('sends nothing while the visitor is reading in the widget', async () => {
    const h = harness();

    replies(h);
    h.redis.isVisitorConnected.mockResolvedValue(true);

    await h.service.processVisitorReplies(NOW);

    expect(h.conversations.findOneAndUpdate).not.toHaveBeenCalled();
    expect(h.mail.sendVisitorReplies).not.toHaveBeenCalled();
  });

  it('mails the replies once for an offline visitor', async () => {
    const h = harness();

    replies(h);
    h.redis.isVisitorConnected.mockResolvedValue(false);
    h.conversations.findOneAndUpdate
      .mockReturnValueOnce(query(streak({ visitorEmailedAt: NOW })))
      .mockReturnValueOnce(query(null));

    await h.service.processVisitorReplies(NOW);
    await h.service.processVisitorReplies(new Date(NOW.getTime() + 60_000));

    expect(h.mail.sendVisitorReplies).toHaveBeenCalledTimes(1);
    expect(h.mail.sendVisitorReplies.mock.calls[0][0]).toEqual({
      to: 'khach@example.test',
      siteName: 'Shop Áo',
      agentName: 'Linh',
      messages: [
        { text: 'Dạ em đây ạ', createdAt: new Date('2026-05-01T09:56:00.000Z') },
      ],
    });
  });

  it('stays quiet when the visitor already read the thread after the streak began', async () => {
    const h = harness();

    h.conversations.find.mockReturnValue(
      query([
        streak({
          visitorLastReadAt: new Date('2026-05-01T09:56:00.000Z'),
        }),
      ]),
    );

    await h.service.processVisitorReplies(NOW);

    expect(h.redis.isVisitorConnected).not.toHaveBeenCalled();
    expect(h.mail.sendVisitorReplies).not.toHaveBeenCalled();
  });

  it('asks the database for unread streaks only, so a read row never fills the batch', async () => {
    const h = harness();

    h.conversations.find.mockReturnValue(query([]));

    await h.service.processVisitorReplies(NOW);

    const filter = h.conversations.find.mock.calls[0][0] as Record<string, unknown>;

    expect(filter.status).toBeUndefined();
    expect(filter.$expr).toEqual({
      $or: [
        { $eq: ['$visitorLastReadAt', null] },
        { $lt: ['$visitorLastReadAt', '$firstUnansweredAgentAt'] },
      ],
    });
    // A week-old streak is history, not a queue entry.
    expect(filter.firstUnansweredAgentAt).toEqual({
      $gt: new Date('2026-04-24T10:00:00.000Z'),
      $lte: new Date('2026-05-01T09:58:00.000Z'),
    });
    expect(filter.$or).toBeUndefined();
  });

  it('mails a streak whose thread the agent replied to and then closed', async () => {
    const h = harness();

    replies(h);
    h.conversations.find.mockReturnValue(query([streak({ status: 'closed' })]));
    h.redis.isVisitorConnected.mockResolvedValue(false);
    h.conversations.findOneAndUpdate.mockReturnValue(
      query(streak({ status: 'closed', visitorEmailedAt: NOW })),
    );

    await h.service.processVisitorReplies(NOW);

    expect(h.mail.sendVisitorReplies).toHaveBeenCalledTimes(1);
  });

  it('retires a streak the visitor cannot be mailed about, so it leaves the queue', async () => {
    const h = harness();

    h.conversations.find.mockReturnValue(query([streak()]));
    h.visitors.findById.mockReturnValue(query({ _id: VISITOR_ID }));
    h.conversations.findOneAndUpdate.mockReturnValue(query(null));

    await h.service.processVisitorReplies(NOW);

    expect(h.mail.sendVisitorReplies).not.toHaveBeenCalled();
    // "Streak handled": the same marker a sent mail sets, CAS-ed on the streak.
    expect(h.conversations.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(h.conversations.findOneAndUpdate.mock.calls[0][0]).toMatchObject({
      _id: CONVERSATION_ID,
      firstUnansweredAgentAt: new Date('2026-05-01T09:55:00.000Z'),
      visitorEmailedAt: null,
    });
    expect(h.conversations.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { visitorEmailedAt: NOW },
    });
  });

  it('pages past deferred rows instead of letting them starve the queue', async () => {
    const h = harness();
    const deferred = Array.from({ length: 50 }, (_, index) =>
      streak({
        _id: new Types.ObjectId(`507f1f77bcf86cd7aa44${String(index).padStart(4, '0')}`),
        firstUnansweredAgentAt: new Date(
          Date.parse('2026-05-01T09:00:00.000Z') + index * 1000,
        ),
      }),
    );

    h.conversations.find
      .mockReturnValueOnce(query(deferred))
      .mockReturnValueOnce(query([streak()]));
    h.visitors.findById.mockReturnValue(
      query({ _id: VISITOR_ID, email: 'khach@example.test' }),
    );
    // Everyone on the first page is reading; only the last row is offline.
    h.redis.isVisitorConnected.mockImplementation(async (conversationId: string) =>
      conversationId === String(CONVERSATION_ID) ? false : true,
    );
    h.messages.find.mockReturnValue(
      query([
        {
          body: 'Dạ em đây ạ',
          createdAt: new Date('2026-05-01T09:56:00.000Z'),
          senderName: 'Linh',
        },
      ]),
    );
    h.conversations.findOneAndUpdate.mockReturnValue(
      query(streak({ visitorEmailedAt: NOW })),
    );

    await h.service.processVisitorReplies(NOW);

    expect(h.conversations.find).toHaveBeenCalledTimes(2);
    // The second page starts after the last row of the first one.
    const second = h.conversations.find.mock.calls[1][0] as Record<string, unknown>;
    expect(second.$or).toEqual([
      { firstUnansweredAgentAt: { $gt: deferred[49].firstUnansweredAgentAt } },
      {
        firstUnansweredAgentAt: deferred[49].firstUnansweredAgentAt,
        _id: { $gt: deferred[49]._id },
      },
    ]);
    expect(h.mail.sendVisitorReplies).toHaveBeenCalledTimes(1);
  });

  it('stops after ten pages, so a backlog cannot stall one sweep', async () => {
    const h = harness();
    const page = Array.from({ length: 50 }, () =>
      streak({ _id: new Types.ObjectId() }),
    );

    h.conversations.find.mockReturnValue(query(page));
    h.visitors.findById.mockReturnValue(
      query({ _id: VISITOR_ID, email: 'khach@example.test' }),
    );
    h.redis.isVisitorConnected.mockResolvedValue(true);

    await h.service.processVisitorReplies(NOW);

    expect(h.conversations.find).toHaveBeenCalledTimes(10);
  });
});

describe('NotificationSchedulerService.tick', () => {
  it('keeps sweeping after one half of the sweep throws', async () => {
    const h = harness();

    h.conversations.find
      .mockImplementationOnce(() => {
        throw new Error('mongo down');
      })
      .mockReturnValue(query([]));

    await expect(h.service.tick(NOW)).resolves.toBeUndefined();
    expect(h.conversations.find).toHaveBeenCalledTimes(2);
  });
});

describe('MailService chat notifications', () => {
  function mail() {
    const config = {
      get: (key: string) =>
        ({ SMTP_HOST: 'smtp.test', MAIL_FROM: '"Chat Center" <no-reply@test>' } as Record<
          string,
          string
        >)[key],
    };

    return new MailService(config as never);
  }

  it('escapes the visitor’s words in the html part but keeps the plain text readable', async () => {
    sent.length = 0;

    await mail().sendMissedChat({
      to: 'linh@example.test',
      agentName: 'Linh <b>',
      visitorLabel: 'An & "B"',
      siteName: 'Shop Áo',
      messages: [{ text: '<script>alert("x")</script>', createdAt: NOW }],
      url: 'http://admin.test/inbox?conversation=x',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('[Chat Center] Khách đang chờ trả lời – An & "B"');

    const html = sent[0].html ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('An &amp; &quot;B&quot;');
    expect(html).toContain('Linh &lt;b&gt;');

    // The text alternative is not markup, so nothing is escaped there.
    expect(sent[0].text).toContain('<script>alert("x")</script>');
  });

  it('names the project in the visitor reply subject and quotes the replies', async () => {
    sent.length = 0;

    await mail().sendVisitorReplies({
      to: 'khach@example.test',
      siteName: 'Shop Áo',
      messages: [{ text: 'Dạ em đây ạ', createdAt: NOW }],
    });

    expect(sent[0].subject).toBe('Shop Áo: bạn có tin nhắn mới');
    expect(sent[0].text).toContain('Dạ em đây ạ');
    expect(sent[0].html).toContain('Dạ em đây ạ');
  });

  it('logs instead of sending when SMTP is not configured', async () => {
    sent.length = 0;

    const config = { get: () => undefined };
    await new MailService(config as never).sendVisitorReplies({
      to: 'khach@example.test',
      siteName: 'Shop Áo',
      messages: [{ text: 'xin chào', createdAt: NOW }],
    });

    expect(sent).toHaveLength(0);
  });
});
