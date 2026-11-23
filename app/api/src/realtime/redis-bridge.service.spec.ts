import { RedisBridgeService } from './redis-bridge.service.js';

/**
 * Presence across processes is "is anybody, anywhere, holding this socket".
 * The shared hash cannot answer `false` from a process that never published the
 * dimension, so an older peer's heartbeat must read as unknown, not offline.
 */
function bridge(
  entries: Record<string, unknown>,
  options: { local?: string; hGetAll?: () => Promise<unknown> } = {},
) {
  const config = { get: () => undefined };
  const registry = {
    isUserConnected: () => false,
    isAnyoneOnlineForSite: () => false,
    teamStatusForSite: () => options.local ?? 'offline',
    siteTeamStatuses: () => ({}),
  };
  const visitors = { isConnected: () => false };

  const service = new RedisBridgeService(
    config as never,
    registry as never,
    visitors as never,
    {} as never,
  );

  const publisher = {
    isReady: true,
    hGetAll: options.hGetAll ?? (async () => entries),
    hDel: async () => 1,
  };

  // The client is created in `onModuleInit` (which would dial a real Redis), so
  // the shape `anyHeartbeatHas` reads is injected instead.
  (service as unknown as { publisher: unknown }).publisher = publisher;
  (service as unknown as { presenceKey: string }).presenceKey = 'test:presence';

  return service;
}

interface TestPublisher {
  isReady: boolean;
  hGetAll: () => Promise<unknown>;
  hDel: (key: string, id: string) => Promise<number>;
}

function publisherOf(service: RedisBridgeService): TestPublisher {
  return (service as unknown as { publisher: TestPublisher }).publisher;
}

const NOW = Date.now();
const fresh = (extra: Record<string, unknown>) => ({
  until: NOW + 10_000,
  sites: [],
  ...extra,
});

describe('RedisBridgeService presence across processes', () => {
  it('is false only when every fresh heartbeat carries the dimension', async () => {
    const service = bridge({
      a: JSON.stringify(fresh({ users: ['u1'], visitorConversations: ['c1'] })),
      b: JSON.stringify(fresh({ users: [], visitorConversations: [] })),
    });

    expect(await service.isUserConnected('u2')).toBe(false);
    expect(await service.isVisitorConnected('c2')).toBe(false);
  });

  it('is true as soon as one heartbeat lists the id', async () => {
    const service = bridge({
      a: JSON.stringify(fresh({ users: ['u1'], visitorConversations: ['c1'] })),
    });

    expect(await service.isUserConnected('u1')).toBe(true);
    expect(await service.isVisitorConnected('c1')).toBe(true);
  });

  it('is unknown when a fresh heartbeat was published without the field', async () => {
    const service = bridge({
      a: JSON.stringify(fresh({ users: ['u1'], visitorConversations: ['c1'] })),
      // An older peer: `until` and `sites` only.
      b: JSON.stringify({ until: NOW + 10_000, sites: [] }),
    });

    expect(await service.isUserConnected('u2')).toBeNull();
    expect(await service.isVisitorConnected('c2')).toBeNull();
  });

  it('treats a stale heartbeat as absent rather than as evidence', async () => {
    const service = bridge({
      old: JSON.stringify({ until: NOW - 1, sites: [], users: [] }),
    });

    expect(await service.isUserConnected('u2')).toBeNull();
    expect(await service.isVisitorConnected('c2')).toBeNull();
  });
});

describe('RedisBridgeService team status across processes', () => {
  it('reports offline when nothing local or remote covers the project', async () => {
    const service = bridge({});

    expect(await service.teamStatusForSite('site-a')).toBe('offline');
  });

  it('treats a legacy heartbeat listing the project as online', async () => {
    const service = bridge({
      peer: JSON.stringify({ until: NOW + 10_000, sites: ['site-a'] }),
    });

    expect(await service.teamStatusForSite('site-a')).toBe('online');
  });

  it('reads the status a peer published for the project', async () => {
    const service = bridge({
      peer: JSON.stringify(
        fresh({ sites: ['site-a'], siteTeamStatus: { 'site-a': 'busy' } }),
      ),
    });

    expect(await service.teamStatusForSite('site-a')).toBe('busy');
  });

  it('picks the best of the local and remote statuses', async () => {
    const service = bridge(
      {
        peer: JSON.stringify(
          fresh({ sites: ['site-a'], siteTeamStatus: { 'site-a': 'away' } }),
        ),
      },
      { local: 'busy' },
    );

    // busy beats away.
    expect(await service.teamStatusForSite('site-a')).toBe('busy');
  });

  it('ignores an expired heartbeat and drops it from the hash', async () => {
    const dropped: string[] = [];
    const service = bridge({});
    const publisher = publisherOf(service);

    publisher.hGetAll = async () => ({
      old: JSON.stringify({
        until: NOW - 1,
        sites: ['site-a'],
        siteTeamStatus: { 'site-a': 'online' },
      }),
    });
    publisher.hDel = async (_key: string, id: string) => {
      dropped.push(id);
      return 1;
    };

    expect(await service.teamStatusForSite('site-a')).toBe('offline');
    expect(dropped).toEqual(['old']);
  });

  it('does not count its own heartbeat twice', async () => {
    const service = bridge({});
    const self = (service as unknown as { id: string }).id;
    const publisher = publisherOf(service);

    publisher.hGetAll = async () => ({
      // Its own row says online, but the local registry (already in the
      // candidate list) says offline -- the row must not resurrect it.
      [self]: JSON.stringify(
        fresh({ sites: ['site-a'], siteTeamStatus: { 'site-a': 'online' } }),
      ),
    });

    expect(await service.teamStatusForSite('site-a')).toBe('offline');
  });

  it('lets the local status win over a worse remote one', async () => {
    const service = bridge(
      {
        peer: JSON.stringify(
          fresh({ sites: ['site-a'], siteTeamStatus: { 'site-a': 'away' } }),
        ),
      },
      { local: 'online' },
    );

    expect(await service.teamStatusForSite('site-a')).toBe('online');
  });

  it('falls back to the local status when Redis errors', async () => {
    const service = bridge(
      {},
      {
        local: 'busy',
        hGetAll: async () => {
          throw new Error('redis down');
        },
      },
    );

    expect(await service.teamStatusForSite('site-a')).toBe('busy');
  });

  it('answers from the local registry when Redis is not connected', async () => {
    const service = bridge({}, { local: 'away' });
    publisherOf(service).isReady = false;

    expect(await service.teamStatusForSite('site-a')).toBe('away');
  });
});
