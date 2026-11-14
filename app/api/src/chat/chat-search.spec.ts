import { vi } from 'vitest';
import { Types } from 'mongoose';
import { ChatService } from './chat.service.js';

const SITE = '507f1f77bcf86cd799431001';

describe('server-side inbox search', () => {
  function setup() {
    const result = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]) };
    const conversations = { find: vi.fn().mockReturnValue(result) };
    const visitors = { find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }) }) };
    const service = new ChatService(visitors as never, conversations as never, {} as never);
    return { service, conversations, visitors };
  }

  it('never queries data for an empty authorized scope', async () => {
    const { service, conversations, visitors } = setup();
    expect(await service.listConversations({ siteIds: [], search: 'secret' })).toEqual([]);
    expect(conversations.find).not.toHaveBeenCalled();
    expect(visitors.find).not.toHaveBeenCalled();
  });

  it('escapes regex characters and scopes both visitor and conversation queries', async () => {
    const { service, conversations, visitors } = setup();
    await service.listConversations({ siteIds: [SITE], search: 'a.*[test]' });
    const visitorFilter = visitors.find.mock.calls[0][0];
    const conversationFilter = conversations.find.mock.calls[0][0];
    expect(String(visitorFilter.siteId.$in[0])).toBe(SITE);
    expect(String(conversationFilter.siteId.$in[0])).toBe(SITE);
    expect(visitorFilter.$or[0].name.$regex).toBe('a\\.\\*\\[test\\]');
    expect(conversationFilter.$and[0].$or[1].lastMessagePreview.$regex).toBe('a\\.\\*\\[test\\]');
  });

  it('keeps assignment and history cursor filters when searching', async () => {
    const { service, conversations } = setup();
    await service.listConversations({ siteIds: [SITE], search: 'alice', assignment: 'unassigned', before: new Date('2026-01-01') });
    const filter = conversations.find.mock.calls[0][0];
    expect(filter.assignedAgentId).toBeNull();
    expect(filter.lastMessageAt).toBeDefined();
    expect(filter.$and).toHaveLength(1);
  });

  it('supports exact conversation and visitor IDs', async () => {
    const { service, conversations } = setup();
    await service.listConversations({ siteIds: [SITE], search: SITE });
    expect(conversations.find.mock.calls[0][0].$and[0].$or).toContainEqual({ _id: new Types.ObjectId(SITE) });
  });
});
