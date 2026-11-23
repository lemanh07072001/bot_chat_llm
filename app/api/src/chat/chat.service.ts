import { cursorFilter, encodeCursor } from './history-cursor.js';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Visitor, VisitorDocument } from './visitor.schema.js';
import {
  Conversation,
  ConversationDocument,
  ConversationStatus,
} from './conversation.schema.js';
import {
  Message,
  MessageDocument,
  MessageSenderKind,
  ReactionKind,
} from './message.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { notifyScopeFilter } from '../notifications/notification-recipients.service.js';
import type { NotifyScope } from '../users/user.schema.js';
import {
  ATTACHMENT_PLACEHOLDER,
  type AttachmentView,
} from '../attachments/attachment.types.js';

export interface AppendMessageInput {
  conversationId: string;
  siteId: string;
  senderKind: MessageSenderKind;
  senderId?: string | null;
  senderName?: string;
  /** May be empty when `attachments` is not. */
  body: string;
  /** Already claimed (AttachmentsService.claim); stored as embedded copies. */
  attachments?: AttachmentView[];
  externalId?: string;
}

export interface SetReactionInput {
  messageId: string;
  conversationId: string;
  kind: ReactionKind;
  reactorId: string;
  /** An empty string removes the caller's reaction. */
  emoji: string;
}

/** Which slice of the inbox to show. */
export type ConversationAssignment = 'all' | 'mine' | 'unassigned';

export interface ListConversationsOptions {
  siteIds: string[];
  status?: ConversationStatus;
  assignment?: ConversationAssignment;
  /** The caller, needed to resolve `assignment: 'mine'`. */
  agentId?: string;
  /** Keyset cursor: only conversations older than this `lastMessageAt`. */
  before?: string | Date;
  limit?: number;
  search?: string;
}

export interface MessagePage {
  messages: MessageDocument[];
  /** True when older messages exist before the first one returned. */
  hasMore: boolean;
  nextCursor: string | null;
}

const PREVIEW_MAX_LENGTH = 200;
const HISTORY_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Visitor.name)
    private readonly visitorModel: Model<VisitorDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    /**
     * Optional so plain-service unit tests can build a ChatService with three
     * models, and so the realtime process (which has no bell) can reuse this
     * class unchanged.
     */
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Visitor keys are always minted server-side. A key the client sends that we
   * do not recognise starts a fresh visitor rather than being trusted, so a
   * caller cannot choose which identity it lands on.
   */
  async resolveVisitor(
    siteId: string,
    visitorKey: string | undefined,
    userAgent?: string,
  ): Promise<VisitorDocument> {
    const siteObjectId = new Types.ObjectId(siteId);

    if (visitorKey) {
      const existing = await this.visitorModel
        .findOneAndUpdate(
          { siteId: siteObjectId, visitorKey },
          {
            $set: {
              lastSeenAt: new Date(),
              ...(userAgent ? { userAgent } : {}),
            },
          },
          { returnDocument: 'after' },
        )
        .exec();

      if (existing) {
        return existing;
      }
    }

    return this.visitorModel.create({
      siteId: siteObjectId,
      visitorKey: randomUUID(),
      userAgent,
      lastSeenAt: new Date(),
    });
  }

  async updateVisitorContact(
    visitorId: string,
    contact: { name?: string; email?: string },
  ): Promise<VisitorDocument | null> {
    const update: Record<string, string> = {};

    if (contact.name) {
      update.name = contact.name;
    }
    if (contact.email) {
      update.email = contact.email;
    }

    if (Object.keys(update).length === 0) {
      return this.findVisitorById(visitorId);
    }

    return this.visitorModel
      .findByIdAndUpdate(
        visitorId,
        { $set: update },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async resolveOpenConversation(
    siteId: string,
    visitorId: string,
  ): Promise<ConversationDocument> {
    const visitorObjectId = new Types.ObjectId(visitorId);

    const existing = await this.conversationModel
      .findOne({
        siteId: new Types.ObjectId(siteId),
        visitorId: visitorObjectId,
      })
      .sort({ lastMessageAt: -1 })
      .exec();

    if (existing) {
      return existing;
    }

    return this.conversationModel.create({
      siteId: new Types.ObjectId(siteId),
      visitorId: visitorObjectId,
      status: 'open',
      lastMessageAt: new Date(),
    });
  }

  async findConversationById(id: string): Promise<ConversationDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.conversationModel.findById(id).exec();
  }

  /**
   * `siteIds` is the caller's access scope and is always supplied by the
   * controller; an empty scope therefore returns nothing rather than
   * everything.
   */
  async listConversations(
    options: ListConversationsOptions,
  ): Promise<ConversationDocument[]> {
    if (options.siteIds.length === 0) {
      return [];
    }

    const filter: Record<string, unknown> = {
      siteId: { $in: options.siteIds.map((id) => new Types.ObjectId(id)) },
    };

    if (options.status) {
      filter.status = options.status;
    }

    if (options.assignment === 'unassigned') {
      filter.assignedAgentId = null;
    } else if (options.assignment === 'mine' && options.agentId) {
      filter.assignedAgentId = new Types.ObjectId(options.agentId);
    }

    if (options.before) {
      Object.assign(filter, cursorFilter('lastMessageAt', options.before));
    }

    const search = options.search?.trim();
    if (search) {
      // Literal matching, never execute a user-supplied regular expression.
      const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scope = { $in: options.siteIds.map((id) => new Types.ObjectId(id)) };
      const visitors = await this.visitorModel.find({
        siteId: scope,
        $or: [{ name: { $regex: pattern, $options: 'i' } }, { email: { $regex: pattern, $options: 'i' } }],
      }).select('_id').exec();
      const searchConditions: Record<string, unknown>[] = [
        { visitorId: { $in: visitors.map((visitor) => visitor._id) } },
        { lastMessagePreview: { $regex: pattern, $options: 'i' } },
      ];
      if (Types.ObjectId.isValid(search)) {
        searchConditions.push({ _id: new Types.ObjectId(search) }, { visitorId: new Types.ObjectId(search) });
      }
      // Cursor filters can also contain $or; combine rather than overwrite them.
      filter.$and = [{ $or: searchConditions }];
    }

    return this.conversationModel
      .find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(Math.min(options.limit ?? HISTORY_PAGE_SIZE, MAX_PAGE_SIZE))
      .exec();
  }

  async countConversations(options: {
    siteIds: string[];
    status?: ConversationStatus;
    assignment?: ConversationAssignment;
    agentId?: string;
  }): Promise<number> {
    if (options.siteIds.length === 0) {
      return 0;
    }

    const filter: Record<string, unknown> = {
      siteId: { $in: options.siteIds.map((id) => new Types.ObjectId(id)) },
    };

    if (options.status) {
      filter.status = options.status;
    }
    if (options.assignment === 'unassigned') {
      filter.assignedAgentId = null;
    } else if (options.assignment === 'mine' && options.agentId) {
      filter.assignedAgentId = new Types.ObjectId(options.agentId);
    }

    return this.conversationModel.countDocuments(filter).exec();
  }

  /**
   * Returns a page of history in ascending order, oldest first, ending at
   * `before` when given. Paging backwards is what a chat thread needs: the
   * newest messages are the ones always shown, and older ones are fetched as
   * the reader scrolls up.
   */
  async unreadCounts(
    siteIds: string[],
    options: { userId?: string; notifyScope?: NotifyScope } = {},
  ): Promise<{
    unread: number;
    unassignedUnread: number;
    /** Conversations waiting on this person, for the tab title. */
    notificationUnread: number;
  }> {
    const [result] = await this.conversationModel.aggregate<{
      unread: number; unassignedUnread: number;
    }>([
      { $match: { siteId: { $in: siteIds.map((id) => new Types.ObjectId(id)) } } },
      { $group: {
        _id: null,
        unread: { $sum: '$unreadForAgent' },
        unassignedUnread: { $sum: { $cond: [
          { $and: [{ $eq: ['$status', 'open'] }, { $eq: [{ $ifNull: ['$assignedAgentId', null] }, null] }] },
          '$unreadForAgent', 0,
        ] } },
      } },
    ]).exec();
    return {
      unread: result?.unread ?? 0,
      unassignedUnread: result?.unassignedUnread ?? 0,
      notificationUnread: await this.countNotificationUnread(siteIds, options),
    };
  }

  /**
   * Threads with something waiting for this person: unread for an agent, inside
   * their own `notifyScope`, across the projects they can open. Counted rather
   * than summed, because the tab title shows how many conversations need an
   * answer, not how many messages arrived.
   */
  private async countNotificationUnread(
    siteIds: string[],
    options: { userId?: string; notifyScope?: NotifyScope },
  ): Promise<number> {
    const userId = options.userId;

    // No caller (an internal job) or no project access means nothing to count.
    if (!userId || siteIds.length === 0 || !Types.ObjectId.isValid(userId)) {
      return 0;
    }

    return this.conversationModel
      .countDocuments({
        siteId: { $in: siteIds.map((id) => new Types.ObjectId(id)) },
        unreadForAgent: { $gt: 0 },
        ...notifyScopeFilter(options.notifyScope, userId),
      })
      .exec();
  }

  async listMessages(
    conversationId: string,
    options: { before?: string | Date; limit?: number } = {},
  ): Promise<MessagePage> {
    const limit = Math.min(options.limit ?? HISTORY_PAGE_SIZE, MAX_PAGE_SIZE);
    const filter: Record<string, unknown> = {
      conversationId: new Types.ObjectId(conversationId),
    };

    if (options.before) {
      Object.assign(filter, cursorFilter('createdAt', options.before));
    }

    // One extra row tells us whether anything older exists, without a count.
    const newestFirst = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasMore = newestFirst.length > limit;

    return {
      messages: newestFirst.slice(0, limit).reverse(),
      hasMore,
      nextCursor: hasMore
        ? encodeCursor(
            newestFirst[limit - 1].get('createdAt') as Date,
            newestFirst[limit - 1]._id,
          )
        : null,
    };
  }

  /**
   * Stores one message and moves the conversation's denormalised tail along.
   *
   * Three things happen here, in order:
   * 1. the message is inserted (or, for an external sender such as Telegram,
   *    the replay of a message we already stored is recognised and returned
   *    untouched — no conversation update, no notification);
   * 2. the conversation is updated atomically, with the *pre-image* read from
   *    the same write, which is what tells us whether this visitor message
   *    started the thread or revived a closed one;
   * 3. the bell is told about a real visitor message, never about a replay.
   *
   * Notification failures are swallowed: the message has already been stored,
   * and losing a chime must never look like a failed send.
   */
  async appendMessage(input: AppendMessageInput): Promise<MessageDocument> {
    const body = (input.body ?? '').trim();
    const attachments = (input.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      mimeType: attachment.mimeType,
      size: attachment.size,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      name: attachment.name ?? null,
    }));

    if (!body && attachments.length === 0) {
      throw new BadRequestException('Tin nhắn trống.');
    }

    if (input.externalId) {
      const existing = await this.messageModel
        .findOne({ externalId: input.externalId })
        .exec();
      if (existing) return existing;
    }

    const values = {
      conversationId: new Types.ObjectId(input.conversationId),
      siteId: new Types.ObjectId(input.siteId),
      senderKind: input.senderKind,
      senderId: input.senderId ? new Types.ObjectId(input.senderId) : null,
      senderName: input.senderName,
      body,
      attachments,
      ...(input.externalId ? { externalId: input.externalId } : {}),
    };

    let message: MessageDocument | null;
    let inserted = true;

    try {
      message = await this.messageModel.create(values);
    } catch (error: unknown) {
      // `create` is the insert attempt: a duplicate externalId means another
      // process (or an earlier attempt) stored this exact message already, so
      // this call is a replay and must not touch the conversation again.
      if (!input.externalId || !isDuplicateKeyError(error)) throw error;
      inserted = false;
      message = await this.messageModel
        .findOne({ externalId: input.externalId })
        .exec();
    }

    if (!message) throw new Error('Message could not be stored');

    // A replay changes nothing: the conversation tail was already moved by the
    // insert that won, and re-applying it would count the same visitor message
    // twice and reopen a thread an agent has since closed.
    if (!inserted) return message;

    const createdAt = message.get('createdAt') as Date;
    const preview = (body || ATTACHMENT_PLACEHOLDER).slice(0, PREVIEW_MAX_LENGTH);
    const conversationId = new Types.ObjectId(input.conversationId);

    // The pre-image: `assignedAgentId`, `visitorId` and `status` as they were
    // before this message, which is exactly what "was it closed / had the
    // visitor ever written?" needs. One write, no read-then-write race.
    //
    // The message is already stored: a failed tail update is logged, not
    // thrown, so callers never treat a stored message as a failed send (and,
    // e.g., hand its attachments back for reuse).
    let previous: ConversationDocument | null;
    try {
      previous = await this.conversationModel
        .findOneAndUpdate(
          { _id: conversationId },
          conversationTailUpdate(input.senderKind, createdAt, preview),
          { returnDocument: 'before', updatePipeline: true },
        )
        .exec();
    } catch (error: unknown) {
      this.logger.warn(
        `Message ${String(message._id)} stored but conversation tail not updated: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return message;
    }

    if (
      input.senderKind !== 'visitor' ||
      !previous ||
      !this.notifications
    ) {
      return message;
    }

    const startsConversation =
      previous.status === 'closed' ||
      (previous.status === 'open' && previous.lastVisitorMessageAt == null);

    try {
      await this.notifications.onVisitorMessage({
        conversation: previous,
        messageId: String(message._id),
        preview,
        createdAt,
        startsConversation,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Visitor message ${String(message._id)} not notified: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return message;
  }

  /** System notes ("closed by X") are messages, so both sides see the same thread. */
  async appendSystemMessage(
    conversationId: string,
    siteId: string,
    body: string,
  ): Promise<MessageDocument> {
    return this.messageModel.create({
      conversationId: new Types.ObjectId(conversationId),
      siteId: new Types.ObjectId(siteId),
      senderKind: 'system',
      senderId: null,
      body,
    });
  }

  /** A single message, or null when the id is not a valid ObjectId. */
  async findMessageById(messageId: string): Promise<MessageDocument | null> {
    if (!Types.ObjectId.isValid(messageId)) return null;

    return this.messageModel.findById(messageId).exec();
  }

  /**
   * Applies one reaction and returns the message as it is afterwards.
   *
   * The whole change is a single update pipeline: the caller's previous entry is
   * filtered out and the new one appended in the same write. Reading the
   * document, editing it and saving would let two people reacting at once
   * overwrite each other, and the array cannot carry a unique index because the
   * uniqueness is on a tuple inside it.
   */
  async setReaction(input: SetReactionInput): Promise<MessageDocument | null> {
    const reactorId = new Types.ObjectId(input.reactorId);
    const next = input.emoji
      ? [{ emoji: input.emoji, kind: input.kind, reactorId }]
      : [];

    return this.messageModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(input.messageId),
          conversationId: new Types.ObjectId(input.conversationId),
          // System notices are not part of the conversation people react to.
          senderKind: { $ne: 'system' },
        },
        [
          {
            $set: {
              reactions: {
                $concatArrays: [
                  {
                    $filter: {
                      input: { $ifNull: ['$reactions', []] },
                      as: 'reaction',
                      cond: {
                        $not: [
                          {
                            $and: [
                              { $eq: ['$$reaction.kind', input.kind] },
                              { $eq: ['$$reaction.reactorId', reactorId] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  // `$literal`, or an emoji that looks like a field path
                  // ("$body") would be evaluated as one.
                  { $literal: next },
                ],
              },
            },
          },
        ],
        { returnDocument: 'after', updatePipeline: true },
      )
      .exec();
  }

  async markReadByAgent(conversationId: string): Promise<void> {
    await this.conversationModel
      .updateOne(
        { _id: new Types.ObjectId(conversationId) },
        { $set: { unreadForAgent: 0 } },
      )
      .exec();
  }

  /**
   * The visitor's widget is open and the tab is visible, so they have seen
   * whatever the agent sent. The missed-chat scheduler reads this to avoid
   * emailing somebody who is looking at the thread right now.
   */
  async markReadByVisitor(conversationId: string): Promise<void> {
    if (!Types.ObjectId.isValid(conversationId)) {
      return;
    }

    await this.conversationModel
      .updateOne(
        { _id: new Types.ObjectId(conversationId) },
        { $set: { visitorLastReadAt: new Date() } },
      )
      .exec();
  }

  /**
   * The visitor was already emailed about the current reply streak by another
   * path (a ticket answer), so the scheduler must not mail the same words again.
   */
  async markVisitorEmailed(conversationId: string): Promise<void> {
    if (!Types.ObjectId.isValid(conversationId)) {
      return;
    }

    await this.conversationModel
      .updateOne(
        { _id: new Types.ObjectId(conversationId), visitorEmailedAt: null },
        { $set: { visitorEmailedAt: new Date() } },
      )
      .exec();
  }

  /**
   * Claiming only succeeds while the thread is free, so two agents pressing
   * "nhận" at the same moment cannot both win — the second gets null back.
   * Passing `expectUnassigned: false` reassigns regardless, which is what an
   * owner handing a thread over does.
   */
  async assignConversation(
    conversationId: string,
    agentId: string | null,
    options: { expectUnassigned?: boolean; expectedAgentId?: string | null } = {},
  ): Promise<ConversationDocument | null> {
    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(conversationId),
    };

    if (options.expectUnassigned) {
      filter.assignedAgentId = null;
    }

    if (options.expectedAgentId !== undefined) {
      filter.assignedAgentId = options.expectedAgentId ? new Types.ObjectId(options.expectedAgentId) : null;
    }
    return this.conversationModel
      .findOneAndUpdate(
        filter,
        {
          $set: {
            assignedAgentId: agentId ? new Types.ObjectId(agentId) : null,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async setConversationStatus(
    conversationId: string,
    status: ConversationStatus,
  ): Promise<ConversationDocument | null> {
    return this.conversationModel
      .findByIdAndUpdate(
        conversationId,
        { $set: { status } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async listVisitorsByIds(ids: string[]): Promise<VisitorDocument[]> {
    return this.visitorModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .exec();
  }

  async findVisitorById(id: string): Promise<VisitorDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.visitorModel.findById(id).exec();
  }

  /**
   * Look a visitor up by the key their browser kept, without creating one.
   *
   * `resolveVisitor` above is the write path and mints a row for an unknown key;
   * this is the read path, used when the caller only wants to know whether an
   * old session can be reattached.
   */
  async findVisitorByKey(
    siteId: string,
    visitorKey: string,
  ): Promise<VisitorDocument | null> {
    if (!Types.ObjectId.isValid(siteId) || !visitorKey) {
      return null;
    }

    return this.visitorModel
      .findOne({
        siteId: new Types.ObjectId(siteId),
        visitorKey,
      })
      .exec();
  }
}

/**
 * The conversation's tail, as one update pipeline so the pre-image and the
 * write are the same operation.
 *
 * - A visitor message revives a closed thread, increments the agent badge and
 *   restarts the unanswered streak (`firstUnansweredAgentAt` cleared,
 *   `visitorEmailedAt` cleared because the streak it dates is over).
 * - An agent message means the thread has been read, ends the missed-chat
 *   streak (`missedNotifiedAt` cleared) and opens a new one only when there is
 *   no streak running already — `$ifNull` keeps the first reply's timestamp.
 * - A system note ("closed by X") moves the preview, and — like any write into
 *   the thread — clears the agent badge; it is not an answer and not a
 *   question, so no streak timestamp moves.
 */
function conversationTailUpdate(
  senderKind: MessageSenderKind,
  createdAt: Date,
  preview: string,
): Record<string, unknown>[] {
  const base: Record<string, unknown> = {
    lastMessageAt: createdAt,
    // `$literal`: the preview is the message's own words, so one starting with
    // "$" ("$100 giảm giá") must be stored as text, not evaluated as a field
    // path / aggregation expression. Everything else in the pipeline is a real
    // expression or comes from our own enums.
    lastMessagePreview: { $literal: preview },
    lastMessageSenderKind: { $literal: senderKind },
  };

  if (senderKind === 'visitor') {
    return [
      {
        $set: {
          ...base,
          status: 'open' as ConversationStatus,
          unreadForAgent: { $add: [{ $ifNull: ['$unreadForAgent', 0] }, 1] },
          lastVisitorMessageAt: createdAt,
          firstUnansweredAgentAt: null,
          visitorEmailedAt: null,
        },
      },
    ];
  }

  if (senderKind === 'agent') {
    return [
      {
        $set: {
          ...base,
          // An agent writing into the thread has by definition read it.
          unreadForAgent: 0,
          lastAgentMessageAt: createdAt,
          missedNotifiedAt: null,
          firstUnansweredAgentAt: { $ifNull: ['$firstUnansweredAgentAt', createdAt] },
        },
      },
    ];
  }

  // A system note keeps the old rule: whoever wrote it was looking at the
  // thread, so it is not left with an agent badge. It starts and ends no
  // streak, so none of the scheduler's timestamps move.
  return [{ $set: { ...base, unreadForAgent: 0 } }];
}

/** Mongo's duplicate-key error code; the only error `create` may be retried on. */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
