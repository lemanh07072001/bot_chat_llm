import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { vi } from 'vitest';
import { TicketsService } from './tickets.service.js';

const ADMIN = '507f1f77bcf86cd799440201';
const AGENT = '507f1f77bcf86cd799440202';
const OTHER = '507f1f77bcf86cd799440203';
const SITE_ID = new Types.ObjectId('507f1f77bcf86cd799440204');
const CONVERSATION_ID = new Types.ObjectId('507f1f77bcf86cd799440205');
const VISITOR_ID = new Types.ObjectId('507f1f77bcf86cd799440206');
const TICKET_ID = new Types.ObjectId('507f1f77bcf86cd799440207');
const AT = new Date('2026-05-01T10:00:00.000Z');
const UPLOAD_ID = '507f1f77bcf86cd799440208';
const CLAIMED_AT = new Date('2026-01-01T00:00:00Z');
const IMAGE = {
  id: UPLOAD_ID,
  url: 'https://cdn.example.com/a.png',
  mimeType: 'image/png' as const,
  size: 10,
  width: 1,
  height: 1,
  name: null,
};

/** A Mongoose query, reduced to the chain these tests reach. */
function query<T>(value: T) {
  const q = {
    sort: () => q,
    skip: () => q,
    limit: () => q,
    select: () => q,
    lean: () => q,
    exec: () => Promise.resolve(value),
  };
  return q;
}

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    _id: TICKET_ID,
    number: 7,
    siteId: SITE_ID,
    conversationId: CONVERSATION_ID,
    visitorId: VISITOR_ID,
    name: 'Lan',
    email: 'lan@example.com',
    message: 'Cần hỗ trợ',
    status: 'new',
    assigneeId: null,
    replies: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function harness(current: Record<string, unknown> = ticket()) {
  const tickets = {
    findById: vi.fn(() => query<unknown>(current)),
    find: vi.fn((_filter: Record<string, unknown>) => query<unknown[]>([current])),
    countDocuments: vi.fn((_filter: Record<string, unknown>) => query(0)),
    exists: vi.fn().mockResolvedValue({ _id: TICKET_ID }),
    findOneAndUpdate: vi.fn(
      (_filter: Record<string, unknown>, change: Record<string, any>, opts?: { returnDocument?: string }) => {
        const before = current;
        const next: Record<string, unknown> = { ...current, ...(change.$set ?? {}) };
        if (change.$push?.replies) next.replies = [...(current.replies as unknown[]), change.$push.replies];
        current = next;
        return query(opts?.returnDocument === 'before' ? before : next);
      },
    ),
    create: vi.fn(),
  };
  const counters = { findOneAndUpdate: vi.fn(() => query({ _id: 'ticket', seq: 1 })) };
  const message = { toJSON: () => ({ id: 'm1', body: 'Xin chào' }) };
  const chat = {
    findConversationById: vi.fn().mockResolvedValue({
      _id: CONVERSATION_ID, visitorId: VISITOR_ID, toJSON: () => ({ id: String(CONVERSATION_ID) }),
    }),
    findVisitorById: vi.fn().mockResolvedValue({ _id: VISITOR_ID, name: 'Lan', email: 'lan@example.com' }),
    appendMessage: vi.fn().mockResolvedValue(message),
    markVisitorEmailed: vi.fn().mockResolvedValue(undefined),
  };
  const sites = {
    accessFor: vi.fn().mockResolvedValue('member'),
    findById: vi.fn().mockResolvedValue({ name: 'Shop' }),
  };
  const users = {
    findById: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(AGENT), name: 'Minh' }),
    findManyByIds: vi.fn().mockResolvedValue([{ _id: new Types.ObjectId(AGENT), name: 'Minh' }]),
    listAdminIds: vi.fn().mockResolvedValue([ADMIN]),
  };
  const bus = { emitToUser: vi.fn(), emitToConversation: vi.fn(), emitToSite: vi.fn() };
  const notifications = { notifyTicket: vi.fn().mockResolvedValue(undefined) };
  const mail = { sendTicketReply: vi.fn().mockResolvedValue(undefined) };
  const attachments = {
    claimWithStamp: vi.fn(async (ids?: string[]) => ({
      attachments: (ids ?? []).map((id) => ({ ...IMAGE, id })),
      claimedAt: CLAIMED_AT,
    })),
    release: vi.fn().mockResolvedValue(undefined),
  };

  const service = new TicketsService(
    tickets as never,
    counters as never,
    chat as never,
    sites as never,
    users as never,
    bus as never,
    attachments as never,
    notifications as never,
    mail as never,
  );
  return { service, tickets, chat, sites, users, bus, notifications, mail, attachments };
}

const admin = { userId: ADMIN, isAdmin: true };
const agent = { userId: AGENT, isAdmin: false, name: 'Minh' };

describe('TicketsService', () => {
  it('hides an unassigned ticket from an agent', async () => {
    const { service } = harness(ticket({ assigneeId: null }));
    await expect(service.get(agent, String(TICKET_ID))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a malformed id with NotFound', async () => {
    const { service } = harness();
    await expect(service.get(admin, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forces an agent list onto their own tickets', async () => {
    const { service, tickets } = harness(ticket({ assigneeId: new Types.ObjectId(AGENT) }));
    await service.list(agent, { assigneeId: OTHER, status: 'new' });

    const filter = tickets.find.mock.calls[0]![0];
    expect(String(filter.assigneeId)).toBe(AGENT);
    expect(filter.status).toBe('new');
    // Status counts ignore the status filter but keep the visibility.
    const countFilters = tickets.countDocuments.mock.calls.map((c) => c[0]);
    expect(countFilters.every((f) => String(f.assigneeId) === AGENT)).toBe(true);
  });

  it('does not let a non-admin assign', async () => {
    const { service } = harness();
    await expect(service.assign(agent, String(TICKET_ID), AGENT)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an assignee without access to the site', async () => {
    const { service, sites, tickets } = harness();
    sites.accessFor.mockResolvedValue('none');
    await expect(service.assign(admin, String(TICKET_ID), AGENT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tickets.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('assigns, notifies the assignee and tells admins', async () => {
    const { service, notifications, bus } = harness();
    const view = await service.assign(admin, String(TICKET_ID), AGENT);

    expect(view.assignee).toEqual({ id: AGENT, name: 'Minh' });
    expect(notifications.notifyTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: [AGENT], kind: 'ticket_assigned', ticketId: String(TICKET_ID) }),
    );
    const notified = bus.emitToUser.mock.calls.map((c) => c[0]);
    expect(notified).toEqual(expect.arrayContaining([ADMIN, AGENT]));
  });

  it('a reply by the assignee lands in the conversation, moves new to in_progress and mails', async () => {
    const { service, chat, bus, mail } = harness(ticket({ assigneeId: new Types.ObjectId(AGENT) }));
    const view = await service.reply(agent, String(TICKET_ID), 'Chúng tôi đã xử lý.');

    expect(chat.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: String(CONVERSATION_ID), siteId: String(SITE_ID), senderKind: 'agent',
      senderId: AGENT, senderName: 'Minh', body: 'Chúng tôi đã xử lý.',
    }));
    expect(bus.emitToConversation).toHaveBeenCalledWith(String(CONVERSATION_ID), 'message:new', expect.objectContaining({
      id: 'm1', sender: expect.objectContaining({ id: AGENT, name: 'Minh' }),
    }));
    expect(bus.emitToSite).toHaveBeenCalledWith(String(SITE_ID), 'conversation:updated', expect.objectContaining({ siteName: 'Shop' }));
    expect(view.status).toBe('in_progress');
    expect(view.replies).toHaveLength(1);
    // The ticket mail is the visitor's email for this answer; the scheduler must not send another.
    expect(chat.markVisitorEmailed).toHaveBeenCalledWith(String(CONVERSATION_ID));
    expect(mail.sendTicketReply).toHaveBeenCalledWith({
      to: 'lan@example.com', siteName: 'Shop', agentName: 'Minh', ticketNumber: 7,
      original: 'Cần hỗ trợ', body: 'Chúng tôi đã xử lý.', attachments: [],
    });
  });

  it('rejects a reply with neither text nor images', async () => {
    const { service, tickets } = harness(ticket({ assigneeId: new Types.ObjectId(AGENT) }));
    await expect(service.reply(agent, String(TICKET_ID), '  ', [])).rejects.toThrow('Nhập nội dung hoặc đính kèm ảnh.');
    expect(tickets.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('an image-only reply claims as the agent and carries the images to chat and mail', async () => {
    const { service, chat, mail, attachments } = harness(ticket({ assigneeId: new Types.ObjectId(AGENT) }));
    const view = await service.reply(agent, String(TICKET_ID), '', [UPLOAD_ID]);

    expect(attachments.claimWithStamp).toHaveBeenCalledWith([UPLOAD_ID], { kind: 'agent', id: AGENT, siteId: String(SITE_ID) });
    expect(view.replies[0]!.attachments).toEqual([IMAGE]);
    expect(chat.appendMessage).toHaveBeenCalledWith(expect.objectContaining({ body: '', attachments: [IMAGE] }));
    expect(mail.sendTicketReply).toHaveBeenCalledWith(expect.objectContaining({ attachments: [IMAGE] }));
  });

  it('does not claim images for somebody who may not act on the ticket', async () => {
    const { service, attachments } = harness(ticket({ assigneeId: null }));
    await expect(service.reply(agent, String(TICKET_ID), '', [UPLOAD_ID])).rejects.toBeInstanceOf(ForbiddenException);
    expect(attachments.claimWithStamp).not.toHaveBeenCalled();
  });

  it('releases the images when the ticket write fails', async () => {
    const { service, tickets, attachments } = harness(ticket({ assigneeId: new Types.ObjectId(AGENT) }));
    tickets.findOneAndUpdate.mockReturnValue(query(null) as never);
    tickets.exists.mockResolvedValue(null);
    await expect(service.reply(agent, String(TICKET_ID), 'Ok', [UPLOAD_ID])).rejects.toBeInstanceOf(NotFoundException);
    expect(attachments.release).toHaveBeenCalledWith([UPLOAD_ID], CLAIMED_AT);
  });

  it('a failing mail does not fail the reply', async () => {
    const { service, mail } = harness(ticket({ assigneeId: new Types.ObjectId(AGENT) }));
    mail.sendTicketReply.mockRejectedValue(new Error('smtp down'));
    await expect(service.reply(agent, String(TICKET_ID), 'Ok')).resolves.toBeTruthy();
  });

  it('summary counts new tickets for admins and open own tickets for agents', async () => {
    const { service, tickets } = harness();
    tickets.countDocuments.mockReturnValue(query(3));

    await expect(service.summary(admin)).resolves.toEqual({ badge: 3 });
    expect(tickets.countDocuments).toHaveBeenLastCalledWith({ status: 'new' });

    await expect(service.summary(agent)).resolves.toEqual({ badge: 3 });
    const last = tickets.countDocuments.mock.calls.at(-1)![0];
    expect(String(last.assigneeId)).toBe(AGENT);
    expect(last.status).toEqual({ $ne: 'done' });
  });
});
