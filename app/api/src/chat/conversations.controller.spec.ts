import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { vi } from 'vitest';
import { ConversationsController } from './conversations.controller.js';
import type { ChatService } from './chat.service.js';
import type { SitesService } from '../sites/sites.service.js';
import type { UsersService } from '../users/users.service.js';
import type { RealtimeBusService } from '../realtime/realtime-bus.service.js';
import type { ConversationDocument } from './conversation.schema.js';
import type { SiteDocument } from '../sites/site.schema.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import type { InternalNotesService } from './internal-notes.service.js';

const OWNER = '507f1f77bcf86cd799430001';
const MANAGER = '507f1f77bcf86cd799430002';
const OUTSIDER = '507f1f77bcf86cd799430003';
const SITE_ID = '507f1f77bcf86cd799431001';
const CONVERSATION_ID = '507f1f77bcf86cd799432001';

const actor = (sub: string): JwtPayload => ({
  sub,
  email: 'staff@example.test',
  role: 'agent',
  ver: 0,
});

const site = {
  _id: SITE_ID,
  name: 'Website bán hàng',
  ownerId: OWNER,
} as unknown as SiteDocument;

function conversation(
  overrides: Record<string, unknown> = {},
): ConversationDocument {
  const base = {
    _id: CONVERSATION_ID,
    siteId: SITE_ID,
    visitorId: '507f1f77bcf86cd799433001',
    status: 'open',
    assignedAgentId: null,
    ...overrides,
  };

  return {
    ...base,
    toJSON: () => ({ ...base, id: CONVERSATION_ID }),
  } as unknown as ConversationDocument;
}

describe('ConversationsController', () => {
  const chat = {
    findConversationById: vi.fn(),
    listConversations: vi.fn(),
    countConversations: vi.fn(),
    unreadCounts: vi.fn(),
    listMessages: vi.fn(),
    listVisitorsByIds: vi.fn(),
    findVisitorById: vi.fn(),
    assignConversation: vi.fn(),
    setConversationStatus: vi.fn(),
    appendSystemMessage: vi.fn(),
  };
  const sites = {
    listAccessible: vi.fn(),
    findById: vi.fn(),
    accessForSite: vi.fn(),
    accessFor: vi.fn(),
  };
  const users = { findById: vi.fn(), findManyByIds: vi.fn() };
  const bus = { emitToSite: vi.fn(), emitToConversation: vi.fn() };
  const notes = { list: vi.fn(), create: vi.fn() };

  const controller = new ConversationsController(
    chat as unknown as ChatService,
    sites as unknown as SitesService,
    users as unknown as UsersService,
    bus as unknown as RealtimeBusService,
    notes as unknown as InternalNotesService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    sites.listAccessible.mockResolvedValue([site]);
    sites.findById.mockResolvedValue(site);
    chat.findConversationById.mockResolvedValue(conversation());
    chat.listVisitorsByIds.mockResolvedValue([]);
    users.findManyByIds.mockResolvedValue([]);
    chat.countConversations.mockResolvedValue(0);
  });

  it('scopes unread message totals to accessible projects', async () => {
    chat.unreadCounts.mockResolvedValue({ unread: 12, unassignedUnread: 3 });
    expect(await controller.unreadCounts(actor(MANAGER))).toEqual({ unread: 12, unassignedUnread: 3 });
    expect(sites.listAccessible).toHaveBeenCalledWith(MANAGER);
    expect(chat.unreadCounts).toHaveBeenCalledWith([SITE_ID]);
  });

  it('never counts other projects for users without access', async () => {
    sites.listAccessible.mockResolvedValue([]);
    chat.unreadCounts.mockResolvedValue({ unread: 0, unassignedUnread: 0 });
    await controller.unreadCounts(actor(OUTSIDER));
    expect(chat.unreadCounts).toHaveBeenCalledWith([]);
  });

  describe('scoping', () => {
    it('passes server search together with the authorized site scope', async () => {
      chat.listConversations.mockResolvedValue([]);
      await controller.list(actor(MANAGER), { search: 'alice@example.test' });
      expect(chat.listConversations).toHaveBeenCalledWith(expect.objectContaining({ siteIds: [SITE_ID], search: 'alice@example.test' }));
    });

    it('does not expose notes to users outside the project', async () => {
      sites.accessForSite.mockResolvedValue('none');
      await expect(controller.notes(actor(OUTSIDER), CONVERSATION_ID, {})).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.addNote(actor(OUTSIDER), CONVERSATION_ID, { body: 'private' })).rejects.toBeInstanceOf(NotFoundException);
      expect(notes.list).not.toHaveBeenCalled();
      expect(notes.create).not.toHaveBeenCalled();
    });

    it('stores a staff note without broadcasting it to visitor rooms', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      users.findById.mockResolvedValue({ name: 'Support' });
      notes.create.mockResolvedValue({ id: 'note', body: 'private' });
      await controller.addNote(actor(MANAGER), CONVERSATION_ID, { body: ' private ' });
      expect(notes.create).toHaveBeenCalledWith(CONVERSATION_ID, MANAGER, 'Support', 'private');
      expect(bus.emitToConversation).not.toHaveBeenCalled();
      expect(bus.emitToSite).not.toHaveBeenCalled();
    });

    it('checks access before paging staff notes', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      notes.list.mockResolvedValue({ notes: [], nextCursor: null });
      await controller.notes(actor(MANAGER), CONVERSATION_ID, { before: OWNER });
      expect(notes.list).toHaveBeenCalledWith(CONVERSATION_ID, OWNER);
    });

    it('lists only the projects the caller belongs to', async () => {
      chat.listConversations.mockResolvedValue([conversation()]);

      await controller.list(actor(MANAGER), {});

      expect(sites.listAccessible).toHaveBeenCalledWith(MANAGER);
      expect(chat.listConversations.mock.calls[0][0]).toMatchObject({
        siteIds: [SITE_ID],
      });
    });

    it('hides a conversation from somebody outside the project', async () => {
      sites.accessForSite.mockResolvedValue('none');

      // Not Forbidden: a different status would confirm the id exists.
      await expect(
        controller.messages(actor(OUTSIDER), CONVERSATION_ID, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(chat.listMessages).not.toHaveBeenCalled();
    });

    it('passes the cursor through when paging history', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      chat.listMessages.mockResolvedValue({ messages: [], hasMore: true });

      const result = await controller.messages(
        actor(MANAGER),
        CONVERSATION_ID,
        {
          before: '2026-01-01T00:00:00.000Z',
          limit: 20,
        },
      );

      expect(chat.listMessages).toHaveBeenCalledWith(CONVERSATION_ID, {
        before: '2026-01-01T00:00:00.000Z',
        limit: 20,
      });
      expect(result.hasMore).toBe(true);
    });
  });

  describe('claiming', () => {
    it('lets a free thread be taken and tells the project about it', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      chat.assignConversation.mockResolvedValue(
        conversation({ assignedAgentId: MANAGER }),
      );

      await controller.claim(actor(MANAGER), CONVERSATION_ID);

      expect(chat.assignConversation).toHaveBeenCalledWith(
        CONVERSATION_ID,
        MANAGER,
        {
          expectUnassigned: true,
        },
      );
      expect(bus.emitToSite).toHaveBeenCalledWith(
        SITE_ID,
        'conversation:updated',
        expect.anything(),
      );
    });

    it('reports who won when two agents claim at once', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      chat.findConversationById.mockResolvedValue(
        conversation({ assignedAgentId: OWNER }),
      );
      // The conditional update found nothing, meaning somebody got there first.
      chat.assignConversation.mockResolvedValue(null);
      users.findById.mockResolvedValue({ name: 'Nguyễn An' });

      await expect(
        controller.claim(actor(MANAGER), CONVERSATION_ID),
      ).rejects.toThrow(/Nguyễn An/);
      await expect(
        controller.claim(actor(MANAGER), CONVERSATION_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('is a no-op when the caller already holds the thread', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      chat.findConversationById.mockResolvedValue(
        conversation({ assignedAgentId: MANAGER }),
      );

      await controller.claim(actor(MANAGER), CONVERSATION_ID);

      expect(chat.assignConversation).not.toHaveBeenCalled();
    });
  });

  it('reloads the winning assignee after losing a concurrent claim', async () => {
    sites.accessForSite.mockResolvedValue('manager');
    chat.findConversationById
      .mockResolvedValueOnce(conversation())
      .mockResolvedValueOnce(conversation({ assignedAgentId: OWNER }));
    chat.assignConversation.mockResolvedValue(null);
    users.findById.mockResolvedValue({ name: 'Winning agent' });
    await expect(
      controller.claim(actor(MANAGER), CONVERSATION_ID),
    ).rejects.toThrow('Winning agent');
    expect(users.findById).toHaveBeenCalledWith(OWNER);
  });

  describe('handing over', () => {
    it('refuses to let a manager reassign somebody else', async () => {
      sites.accessForSite.mockResolvedValue('manager');

      await expect(
        controller.assign(actor(MANAGER), CONVERSATION_ID, {
          agentId: OUTSIDER,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(chat.assignConversation).not.toHaveBeenCalled();
    });

    it('refuses a target who cannot open the project', async () => {
      sites.accessForSite.mockResolvedValue('owner');
      sites.accessFor.mockResolvedValue('none');

      await expect(
        controller.assign(actor(OWNER), CONVERSATION_ID, { agentId: OUTSIDER }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(chat.assignConversation).not.toHaveBeenCalled();
    });

    it('lets the owner hand a thread to a member', async () => {
      sites.accessForSite.mockResolvedValue('owner');
      sites.accessFor.mockResolvedValue('manager');
      users.findById.mockResolvedValue({ _id: MANAGER });
      chat.assignConversation.mockResolvedValue(
        conversation({ assignedAgentId: MANAGER }),
      );

      await controller.assign(actor(OWNER), CONVERSATION_ID, {
        agentId: MANAGER,
      });

      expect(chat.assignConversation).toHaveBeenCalledWith(
        CONVERSATION_ID,
        MANAGER,
      );
    });

    it('only lets the holder or the owner release a thread', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      chat.findConversationById.mockResolvedValue(
        conversation({ assignedAgentId: OWNER }),
      );

      await expect(
        controller.release(actor(MANAGER), CONVERSATION_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);

      sites.accessForSite.mockResolvedValue('owner');
      chat.assignConversation.mockResolvedValue(conversation());

      await controller.release(actor(OWNER), CONVERSATION_ID);

      expect(chat.assignConversation).toHaveBeenCalledWith(
        CONVERSATION_ID,
        null,
        { expectedAgentId: OWNER },
      );
    });
  });

  describe('closing', () => {
    it('writes a system note the visitor also sees', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      chat.setConversationStatus.mockResolvedValue(
        conversation({ status: 'closed' }),
      );
      users.findById.mockResolvedValue({ name: 'Trần Bình' });
      chat.appendSystemMessage.mockResolvedValue({
        toJSON: () => ({ id: 'm1' }),
      });

      await controller.close(actor(MANAGER), CONVERSATION_ID);

      expect(chat.appendSystemMessage.mock.calls[0][2]).toContain('Trần Bình');
      expect(bus.emitToConversation).toHaveBeenCalledWith(
        CONVERSATION_ID,
        'message:new',
        {
          id: 'm1',
        },
      );
    });

    it('does nothing when the thread is already in that state', async () => {
      sites.accessForSite.mockResolvedValue('manager');
      chat.findConversationById.mockResolvedValue(
        conversation({ status: 'closed' }),
      );

      await controller.close(actor(MANAGER), CONVERSATION_ID);

      expect(chat.setConversationStatus).not.toHaveBeenCalled();
      expect(chat.appendSystemMessage).not.toHaveBeenCalled();
    });
  });
});
