import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { SitesService } from '../sites/sites.service.js';
import { UsersService } from '../users/users.service.js';
import { normalizeNotifyScope, type NotifyScope } from '../users/user.schema.js';
import type { UserDocument } from '../users/user.schema.js';
import type { ConversationDocument } from '../chat/conversation.schema.js';

/**
 * The same scope as `includes()` expressed as a query filter, so the unread
 * badge can count conversations without loading them. Keeping the two next to
 * each other is what stops them drifting apart.
 */
export function notifyScopeFilter(
  scope: NotifyScope | null | undefined,
  userId: string,
): Record<string, unknown> {
  switch (normalizeNotifyScope(scope)) {
    case 'all':
      return {};
    case 'mine':
      return { assignedAgentId: new Types.ObjectId(userId) };
    default:
      return {
        $or: [
          { assignedAgentId: null },
          { assignedAgentId: new Types.ObjectId(userId) },
        ],
      };
  }
}

/**
 * Which staff a conversation's notifications belong to.
 *
 * The project owner plus every member, deduped, so nobody who cannot open the
 * project any more is told about its traffic. "Any role" on purpose: a manager
 * who answers chats needs the same bells as the owner, only the mailing of
 * project settings is narrower.
 */
@Injectable()
export class NotificationRecipientsService {
  constructor(
    private readonly sites: SitesService,
    private readonly users: UsersService,
  ) {}

  /** Every person who may be told about this conversation, preference aside. */
  async forConversation(
    conversation: ConversationDocument,
  ): Promise<UserDocument[]> {
    const siteId = String(conversation.siteId);
    const site = await this.sites.findById(siteId);

    if (!site) {
      return [];
    }

    const memberships = await this.sites.listMemberships(siteId);
    const ids = [
      ...new Set([
        String(site.ownerId),
        ...memberships.map((membership) => String(membership.userId)),
      ]),
    ];

    return this.users.findManyByIds(ids);
  }

  /**
   * The subset whose own `notifyScope` covers this conversation. Assignment is
   * read from the conversation as it is *now*, so somebody who just handed the
   * thread away does not hear about the next visitor message in it.
   */
  async forConversationInScope(
    conversation: ConversationDocument,
  ): Promise<UserDocument[]> {
    const assignedAgentId = this.assignedAgentIdOf(conversation);

    return (await this.forConversation(conversation)).filter((user) =>
      this.includes(user.notifyScope, assignedAgentId, String(user._id)),
    );
  }

  /**
   * Which conversations may interrupt somebody, given their own preference.
   * `mine_unassigned` is the default: a team inbox is shared work, so a thread
   * nobody has taken yet still needs an answer from somebody.
   */
  includes(
    scope: NotifyScope | null | undefined,
    assignedAgentId: string | null | undefined,
    userId: string,
  ): boolean {
    const assigned = assignedAgentId ? String(assignedAgentId) : null;

    switch (normalizeNotifyScope(scope)) {
      case 'all':
        return true;
      case 'mine':
        return assigned !== null && assigned === userId;
      default:
        return assigned === null || assigned === userId;
    }
  }

  /** `contact_left` follows the same scope as a new message. */
  async forContactLeft(
    conversation: ConversationDocument,
  ): Promise<UserDocument[]> {
    return this.forConversationInScope(conversation);
  }

  /** Only the new holder hears about being handed a thread. */
  async forAssignment(agentId: string): Promise<UserDocument[]> {
    return this.users.findManyByIds([agentId]);
  }

  /** String form used in filters and payloads; null when nobody holds it. */
  assignedAgentIdOf(
    conversation: Pick<ConversationDocument, 'assignedAgentId'>,
  ): string | null {
    return conversation.assignedAgentId ? String(conversation.assignedAgentId) : null;
  }
}
