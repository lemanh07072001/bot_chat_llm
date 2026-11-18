import { cursorFilter, encodeCursor } from './history-cursor.js';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
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
} from './message.schema.js';

export interface AppendMessageInput {
  conversationId: string;
  siteId: string;
  senderKind: MessageSenderKind;
  senderId?: string | null;
  senderName?: string;
  body: string;
  externalId?: string;
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
  constructor(
    @InjectModel(Visitor.name)
    private readonly visitorModel: Model<VisitorDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
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
  async unreadCounts(siteIds: string[]): Promise<{ unread: number; unassignedUnread: number }> {
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
    return { unread: result?.unread ?? 0, unassignedUnread: result?.unassignedUnread ?? 0 };
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

  async appendMessage(input: AppendMessageInput): Promise<MessageDocument> {
    if (input.externalId) {
      const existing = await this.messageModel.findOne({ externalId: input.externalId }).exec();
      if (existing) return existing;
    }
    const values = {
      conversationId: new Types.ObjectId(input.conversationId),
      siteId: new Types.ObjectId(input.siteId),
      senderKind: input.senderKind,
      senderId: input.senderId ? new Types.ObjectId(input.senderId) : null,
      senderName: input.senderName,
      body: input.body,
      ...(input.externalId ? { externalId: input.externalId } : {}),
    };
    const message = input.externalId
      ? await this.messageModel.findOneAndUpdate({ externalId: input.externalId }, { $setOnInsert: values }, { upsert: true, returnDocument: 'after' }).exec()
      : await this.messageModel.create(values);
    if (!message) throw new Error('Message could not be stored');

    const fromVisitor = input.senderKind === 'visitor';

    const update: Record<string, unknown> = {
      $set: {
        lastMessageAt: message.get('createdAt') as Date,
        lastMessagePreview: input.body.slice(0, PREVIEW_MAX_LENGTH),
        // An agent writing into the thread has by definition read it.
        ...(fromVisitor ? {} : { unreadForAgent: 0 }),
        // A visitor writing again revives a thread an agent had closed, so the
        // message cannot land in a closed conversation nobody is watching.
        ...(fromVisitor ? { status: 'open' as ConversationStatus } : {}),
      },
    };

    if (fromVisitor) {
      update.$inc = { unreadForAgent: 1 };
    }

    await this.conversationModel
      .updateOne({ _id: message.conversationId }, update)
      .exec();

    return message;
  }

  /**
   * Stores one translation on a message, replacing an older one for the same
   * language. Two calls for different languages both survive.
   */
  async saveMessageTranslation(
    messageId: string,
    conversationId: string,
    entry: { lang: string; text: string; model?: string },
  ): Promise<MessageDocument | null> {
    if (!Types.ObjectId.isValid(messageId)) {
      return null;
    }

    const filter = {
      _id: new Types.ObjectId(messageId),
      conversationId: new Types.ObjectId(conversationId),
    };

    // `$pull` then `$push`: a `$set` on the array element would need a
    // positional match, and Mongo refuses `$push` and `$pull` on one field.
    await this.messageModel
      .updateOne(filter, { $pull: { translations: { lang: entry.lang } } })
      .exec();

    return this.messageModel
      .findOneAndUpdate(
        filter,
        { $push: { translations: { ...entry, at: new Date() } } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async findMessageById(
    messageId: string,
    conversationId: string,
  ): Promise<MessageDocument | null> {
    if (!Types.ObjectId.isValid(messageId)) {
      return null;
    }

    return this.messageModel
      .findOne({
        _id: new Types.ObjectId(messageId),
        conversationId: new Types.ObjectId(conversationId),
      })
      .exec();
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

  async markReadByAgent(conversationId: string): Promise<void> {
    await this.conversationModel
      .updateOne(
        { _id: new Types.ObjectId(conversationId) },
        { $set: { unreadForAgent: 0 } },
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
}
