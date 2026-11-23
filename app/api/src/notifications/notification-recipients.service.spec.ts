import { Types } from 'mongoose';
import { vi } from 'vitest';
import {
  NotificationRecipientsService,
  notifyScopeFilter,
} from './notification-recipients.service.js';
import type { ConversationDocument } from '../chat/conversation.schema.js';

const AGENT = '507f1f77bcf86cd799440001';
const OTHER = '507f1f77bcf86cd799440002';

/**
 * `includes()` is the rule the bell and the desktop notification both obey, so
 * it is pinned per scope rather than through the query that mirrors it.
 */
describe('NotificationRecipientsService.includes', () => {
  const service = new NotificationRecipientsService(
    {} as never,
    {} as never,
  );

  it('never interrupts somebody about a thread they do not hold when scoped to mine', () => {
    expect(service.includes('mine', AGENT, AGENT)).toBe(true);
    expect(service.includes('mine', OTHER, AGENT)).toBe(false);
    // An unassigned thread is not "mine" until somebody takes it.
    expect(service.includes('mine', null, AGENT)).toBe(false);
  });

  it('includes unassigned threads in the default scope', () => {
    expect(service.includes('mine_unassigned', null, AGENT)).toBe(true);
    expect(service.includes('mine_unassigned', AGENT, AGENT)).toBe(true);
    // Somebody else's thread is not this person's work.
    expect(service.includes('mine_unassigned', OTHER, AGENT)).toBe(false);
  });

  it('includes every thread for a person who asked for all', () => {
    expect(service.includes('all', null, AGENT)).toBe(true);
    expect(service.includes('all', OTHER, AGENT)).toBe(true);
  });

  it('reads a stored or stale value as the default scope', () => {
    // An account written before the preference existed has no value at all;
    // an older client may send something this version does not know.
    expect(service.includes(undefined, null, AGENT)).toBe(true);
    expect(service.includes(null, OTHER, AGENT)).toBe(false);
    expect(service.includes('everything' as never, null, AGENT)).toBe(true);
    expect(service.includes('everything' as never, OTHER, AGENT)).toBe(false);
  });

  it('compares an ObjectId assignee with the string form of the person', () => {
    expect(service.includes('mine', new Types.ObjectId(AGENT) as never, AGENT)).toBe(
      true,
    );
  });
});

/**
 * The filter has to answer the same question as `includes()`; if the two drift
 * the badge count starts disagreeing with the chime.
 */
describe('notifyScopeFilter', () => {
  it('adds no assignment condition for all', () => {
    expect(notifyScopeFilter('all', AGENT)).toEqual({});
  });

  it('counts only the caller’s own threads for mine', () => {
    expect(notifyScopeFilter('mine', AGENT)).toEqual({
      assignedAgentId: new Types.ObjectId(AGENT),
    });
  });

  it('counts the caller’s threads plus the unclaimed ones by default', () => {
    const filter = notifyScopeFilter('mine_unassigned', AGENT) as {
      $or: Array<Record<string, unknown>>;
    };

    // Both branches have to be there: an unassigned thread is still work.
    expect(filter.$or).toEqual([
      { assignedAgentId: null },
      { assignedAgentId: new Types.ObjectId(AGENT) },
    ]);
  });

  it('falls back to the default filter for a missing scope', () => {
    expect(notifyScopeFilter(undefined, AGENT)).toEqual(
      notifyScopeFilter('mine_unassigned', AGENT),
    );
  });
});

describe('NotificationRecipientsService.forConversationInScope', () => {
  // `vi.fn()` without a type argument, so `mockResolvedValue` accepts the
  // partial documents these tests build.
  function serviceFor(users: Array<Record<string, unknown>>) {
    const sites = { findById: vi.fn(), listMemberships: vi.fn() };
    const userService = { findManyByIds: vi.fn() };

    sites.findById.mockResolvedValue({ _id: 'site', ownerId: 'owner' });
    sites.listMemberships.mockResolvedValue([{ userId: 'member' }]);
    userService.findManyByIds.mockResolvedValue(users);

    const recipients = new NotificationRecipientsService(
      sites as never,
      userService as never,
    );

    return { recipients, sites, userService };
  }

  const conversation = {
    _id: 'conv',
    siteId: 'site',
    assignedAgentId: null,
  } as unknown as ConversationDocument;

  it('filters by each person’s own preference against the current assignee', async () => {
    const mine = { _id: AGENT, notifyScope: 'mine' };
    const unassigned = { _id: OTHER, notifyScope: 'mine_unassigned' };
    const { recipients } = serviceFor([mine, unassigned]);

    // Nobody holds the thread, so only the person who accepts unassigned work
    // hears about it.
    expect(await recipients.forConversationInScope(conversation)).toEqual([
      unassigned,
    ]);
  });

  it('tells nobody when the project has vanished', async () => {
    const { recipients, sites } = serviceFor([]);
    sites.findById.mockResolvedValue(null);

    expect(await recipients.forConversationInScope(conversation)).toEqual([]);
    // A deleted project must not fall through to "everybody".
    expect(sites.listMemberships).not.toHaveBeenCalled();
  });
});
