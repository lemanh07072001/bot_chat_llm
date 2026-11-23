import { vi } from 'vitest';
import {
  AgentRegistryService,
  type AgentConnection,
} from './agent-registry.service.js';
import { conversationRoom, siteRoom } from './rooms.js';

function fakeConnection(id: string): AgentConnection & {
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
} {
  return { id, join: vi.fn(), leave: vi.fn(), emit: vi.fn() };
}

describe('AgentRegistryService', () => {
  let registry: AgentRegistryService;

  beforeEach(() => {
    registry = new AgentRegistryService();
  });

  it('answers what a socket may read', () => {
    registry.register(
      'user-1',
      ['site-a', 'site-b'],
      fakeConnection('socket-1'),
    );

    expect(registry.mayRead('socket-1', 'site-a')).toBe(true);
    expect(registry.mayRead('socket-1', 'site-c')).toBe(false);
    expect(registry.mayRead('unknown-socket', 'site-a')).toBe(false);
  });

  it('revokes a project on the open socket instead of waiting for a reconnect', () => {
    const connection = fakeConnection('socket-1');
    registry.register('user-1', ['site-a'], connection);

    registry.revokeSite('user-1', 'site-a');

    expect(connection.leave).toHaveBeenCalledWith(siteRoom('site-a'));
    expect(connection.emit).toHaveBeenCalledWith('access:revoked', {
      siteId: 'site-a',
    });
    expect(registry.mayRead('socket-1', 'site-a')).toBe(false);
  });

  it('evicts every watched conversation of the revoked project only', () => {
    const connection = fakeConnection('socket-1');
    registry.register('user-1', ['site-a', 'site-b'], connection);
    registry.watchConversation('socket-1', 'site-a', 'thread-a');
    registry.watchConversation('socket-1', 'site-b', 'thread-b');
    registry.revokeSite('user-1', 'site-a');
    expect(connection.leave).toHaveBeenCalledWith(conversationRoom('thread-a'));
    expect(connection.leave).not.toHaveBeenCalledWith(
      conversationRoom('thread-b'),
    );
    expect(registry.watchConversation('socket-1', 'site-a', 'thread-a')).toBe(
      false,
    );
    expect(registry.siteIdsForSocket('socket-1')).toEqual(['site-b']);
  });

  it('grants a project to every socket that person has open', () => {
    const first = fakeConnection('socket-1');
    const second = fakeConnection('socket-2');
    registry.register('user-1', [], first);
    registry.register('user-1', [], second);

    registry.grantSite('user-1', 'site-a');

    expect(first.join).toHaveBeenCalledWith(siteRoom('site-a'));
    expect(second.join).toHaveBeenCalledWith(siteRoom('site-a'));
    expect(registry.mayRead('socket-2', 'site-a')).toBe(true);
  });

  it('leaves other people alone when revoking', () => {
    const mine = fakeConnection('socket-1');
    const theirs = fakeConnection('socket-2');
    registry.register('user-1', ['site-a'], mine);
    registry.register('user-2', ['site-a'], theirs);

    registry.revokeSite('user-1', 'site-a');

    expect(theirs.leave).not.toHaveBeenCalled();
    expect(registry.mayRead('socket-2', 'site-a')).toBe(true);
  });

  it('tracks presence per project and forgets a socket on disconnect', () => {
    registry.register('user-1', ['site-a'], fakeConnection('socket-1'));

    expect(registry.isAnyoneOnlineForSite('site-a')).toBe(true);
    expect(registry.isAnyoneOnlineForSite('site-b')).toBe(false);
    expect(registry.onlineUserIdsForSite('site-a')).toEqual(['user-1']);

    registry.unregister('socket-1');

    expect(registry.isAnyoneOnlineForSite('site-a')).toBe(false);
    expect(registry.onlineUserIdsForSite('site-a')).toEqual([]);
  });

  it('counts a person once while they have several tabs open', () => {
    registry.register('user-1', ['site-a'], fakeConnection('socket-1'));
    registry.register('user-1', ['site-a'], fakeConnection('socket-2'));

    expect(registry.onlineUserIdsForSite('site-a')).toEqual(['user-1']);

    registry.unregister('socket-1');

    // Still online through the other tab.
    expect(registry.isAnyoneOnlineForSite('site-a')).toBe(true);
  });

  it('reports a project offline when no agent is connected to it', () => {
    expect(registry.teamStatusForSite('site-a')).toBe('offline');
  });

  it('takes the best status among the agents of that project', () => {
    registry.register('user-1', ['site-a'], fakeConnection('socket-1'), 'online');
    registry.register('user-2', ['site-a'], fakeConnection('socket-2'), 'busy');

    // online beats busy.
    expect(registry.teamStatusForSite('site-a')).toBe('online');

    registry.setUserStatus('user-1', 'busy');

    // busy beats away.
    registry.register('user-3', ['site-a'], fakeConnection('socket-3'), 'away');
    expect(registry.teamStatusForSite('site-a')).toBe('busy');
  });

  it('ignores agents connected only to other projects', () => {
    registry.register('user-1', ['site-b'], fakeConnection('socket-1'), 'online');

    expect(registry.teamStatusForSite('site-a')).toBe('offline');
    expect(registry.siteTeamStatuses()).toEqual({ 'site-b': 'online' });
  });

  it('defaults an agent registered without a status to online', () => {
    registry.register('user-1', ['site-a'], fakeConnection('socket-1'));

    expect(registry.statusForUser('user-1')).toBe('online');
    expect(registry.teamStatusForSite('site-a')).toBe('online');
  });

  it("applies a person's status to every tab and re-announces their projects", () => {
    const announced: string[] = [];
    registry.onPresenceChanged((siteId) => announced.push(siteId));

    registry.register('user-1', ['site-a'], fakeConnection('socket-1'));
    registry.register('user-1', ['site-a', 'site-b'], fakeConnection('socket-2'));
    registry.register('user-2', ['site-c'], fakeConnection('socket-3'));

    const covered = registry.setUserStatus('user-1', 'away');

    expect(covered).toEqual(['site-a', 'site-b']);
    expect(registry.statusForUser('user-1')).toBe('away');
    expect(registry.teamStatusForSite('site-a')).toBe('away');
    expect(registry.teamStatusForSite('site-b')).toBe('away');
    expect(announced).toEqual(['site-a', 'site-b']);
    // Someone else's session is untouched.
    expect(registry.statusForUser('user-2')).toBe('online');
    expect(registry.teamStatusForSite('site-c')).toBe('online');
  });

  it('has nothing to update for a person with no open socket', () => {
    const announced: string[] = [];
    registry.onPresenceChanged((siteId) => announced.push(siteId));

    expect(registry.setUserStatus('user-1', 'busy')).toEqual([]);
    expect(registry.statusForUser('user-1')).toBeNull();
    expect(announced).toEqual([]);
  });

  it('summarises the best status per project for the heartbeat', () => {
    registry.register('user-1', ['site-a'], fakeConnection('socket-1'), 'busy');
    registry.register('user-2', ['site-a', 'site-b'], fakeConnection('socket-2'), 'online');
    registry.register('user-3', ['site-b'], fakeConnection('socket-3'), 'away');

    expect(registry.siteTeamStatuses()).toEqual({
      'site-a': 'online',
      'site-b': 'online',
    });

    registry.setUserStatus('user-2', 'away');

    expect(registry.siteTeamStatuses()).toEqual({
      'site-a': 'busy',
      'site-b': 'away',
    });
  });
});
