import { Types } from 'mongoose';
import { vi } from 'vitest';
import { WidgetService } from './widget.service.js';
import type { ConversationDocument } from '../chat/conversation.schema.js';
import type { VisitorDocument } from '../chat/visitor.schema.js';
import type { SiteDocument } from '../sites/site.schema.js';

const SITE_ID = new Types.ObjectId('507f1f77bcf86cd799440401');
const VISITOR_ID = new Types.ObjectId('507f1f77bcf86cd799440402');
const CONVERSATION_ID = new Types.ObjectId('507f1f77bcf86cd799440403');
const PUBLIC_KEY = 'pk_' + '0'.repeat(32);

function site(): SiteDocument {
  return {
    _id: SITE_ID,
    active: true,
    settings: { title: 'Chat' },
    officeHours: { enabled: false, offlineMessage: 'Ngoài giờ' },
  } as unknown as SiteDocument;
}

function visitor(): VisitorDocument {
  return {
    _id: VISITOR_ID,
    visitorKey: 'known-key',
    name: 'An',
    email: 'an@example.test',
  } as unknown as VisitorDocument;
}

function conversation(): ConversationDocument {
  return {
    _id: CONVERSATION_ID,
    assignedAgentId: null,
  } as unknown as ConversationDocument;
}

function harness(options: { withBridge?: boolean } = {}) {
  const sites = {
    findByPublicKey: vi.fn().mockResolvedValue(site()),
    isOriginAllowed: vi.fn().mockReturnValue(true),
    isWithinOfficeHours: vi.fn().mockReturnValue(true),
    findById: vi.fn(),
  };
  const chat = {
    findVisitorByKey: vi.fn().mockResolvedValue(null),
    resolveVisitor: vi.fn().mockResolvedValue(visitor()),
    resolveOpenConversation: vi.fn().mockResolvedValue(conversation()),
    listMessages: vi
      .fn()
      .mockResolvedValue({ messages: [], hasMore: false, nextCursor: null }),
  };
  const jwt = { sign: vi.fn().mockReturnValue('visitor-token') };
  const agents = {
    isAnyoneOnlineForSite: vi.fn().mockReturnValue(true),
    teamStatusForSite: vi.fn().mockReturnValue('online'),
  };
  const bridge = {
    isAnyoneOnline: vi.fn().mockResolvedValue(true),
    teamStatusForSite: vi.fn().mockResolvedValue('online'),
  };
  const users = { findManyByIds: vi.fn().mockResolvedValue([]) };
  const config = { get: (key: string) => (key === 'PUBLIC_REALTIME_URL' ? 'http://rt.test' : undefined) };

  const service = new WidgetService(
    sites as never,
    chat as never,
    jwt as never,
    agents as never,
    users as never,
    config as never,
    (options.withBridge ? bridge : undefined) as never,
  );

  return { service, sites, chat, jwt, agents, bridge, users };
}

describe('WidgetService.createSession resumeOnly', () => {
  it('answers { resumed: false } for a missing key without minting a visitor or a thread', async () => {
    const h = harness();

    expect(
      await h.service.createSession({ publicKey: PUBLIC_KEY, resumeOnly: true }),
    ).toEqual({ resumed: false });

    expect(h.chat.findVisitorByKey).not.toHaveBeenCalled();
    expect(h.chat.resolveVisitor).not.toHaveBeenCalled();
    expect(h.chat.resolveOpenConversation).not.toHaveBeenCalled();
  });

  it('answers { resumed: false } for a key this project has never seen', async () => {
    const h = harness();
    h.chat.findVisitorByKey.mockResolvedValue(null);

    expect(
      await h.service.createSession({
        publicKey: PUBLIC_KEY,
        visitorKey: 'stale-key',
        resumeOnly: true,
      }),
    ).toEqual({ resumed: false });

    // Nothing may be written on a poll: an unknown key starts no identity.
    expect(h.chat.resolveVisitor).not.toHaveBeenCalled();
    expect(h.chat.resolveOpenConversation).not.toHaveBeenCalled();
  });

  it('rebuilds a normal session from a known key', async () => {
    const h = harness();
    h.chat.findVisitorByKey.mockResolvedValue(visitor());

    const session = await h.service.createSession({
      publicKey: PUBLIC_KEY,
      visitorKey: 'known-key',
      resumeOnly: true,
    });

    expect(session).toMatchObject({
      visitorToken: 'visitor-token',
      visitorKey: 'known-key',
      visitorId: String(VISITOR_ID),
      conversationId: String(CONVERSATION_ID),
      realtimeUrl: 'http://rt.test',
      contact: { name: 'An', email: 'an@example.test' },
      messages: [],
    });
    expect(h.chat.findVisitorByKey).toHaveBeenCalledWith(String(SITE_ID), 'known-key');
    expect(h.chat.resolveVisitor).not.toHaveBeenCalled();
  });

  it('still refuses an unknown project or a foreign origin before answering', async () => {
    const unknown = harness();
    unknown.sites.findByPublicKey.mockResolvedValue(null);
    await expect(
      unknown.service.createSession({ publicKey: PUBLIC_KEY, resumeOnly: true }),
    ).rejects.toThrow();

    const foreign = harness();
    foreign.sites.isOriginAllowed.mockReturnValue(false);
    await expect(
      foreign.service.createSession({
        publicKey: PUBLIC_KEY,
        visitorKey: 'known-key',
        resumeOnly: true,
        origin: 'https://evil.test',
      }),
    ).rejects.toThrow();
  });

  it('creates a visitor on the normal (non-resume) path', async () => {
    const h = harness();

    const session = await h.service.createSession({ publicKey: PUBLIC_KEY });

    expect(h.chat.resolveVisitor).toHaveBeenCalledWith(String(SITE_ID), undefined, undefined);
    expect(session).toMatchObject({ conversationId: String(CONVERSATION_ID) });
  });
});

describe('WidgetService availability', () => {
  it("reports the team's busy status and the default busy message", async () => {
    const h = harness({ withBridge: true });
    h.sites.findById.mockResolvedValue(site());
    h.bridge.teamStatusForSite.mockResolvedValue('busy');

    const availability = await h.service.availabilityForSite(String(SITE_ID));

    expect(availability).toMatchObject({
      agentsOnline: true,
      teamStatus: 'busy',
      busyMessage: expect.stringContaining('Các nhân viên hiện đang bận'),
    });
    expect(h.bridge.teamStatusForSite).toHaveBeenCalledWith(String(SITE_ID));
  });

  it('reports nobody online when the whole team is offline', async () => {
    const h = harness({ withBridge: true });
    h.sites.findById.mockResolvedValue(site());
    h.bridge.teamStatusForSite.mockResolvedValue('offline');

    const availability = await h.service.availabilityForSite(String(SITE_ID));

    expect(availability.agentsOnline).toBe(false);
    expect(availability.teamStatus).toBe('offline');
  });

  it('gives old sessions the default messages when the project has none stored', async () => {
    const h = harness();

    const session = await h.service.createSession({ publicKey: PUBLIC_KEY });

    expect(session).toMatchObject({
      settings: { title: 'Chat', busyMessage: expect.any(String), awayMessage: expect.any(String) },
      availability: { teamStatus: 'online', busyMessage: expect.any(String) },
    });
    // Without a bridge the local registry answers, not Redis.
    expect(h.agents.teamStatusForSite).toHaveBeenCalledWith(String(SITE_ID));
  });
});
