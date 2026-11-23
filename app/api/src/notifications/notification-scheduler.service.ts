import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  type ConversationDocument,
} from '../chat/conversation.schema.js';
import { serializeAttachments } from '../attachments/attachment.types.js';
import { Message, type MessageDocument } from '../chat/message.schema.js';
import { Visitor, type VisitorDocument } from '../chat/visitor.schema.js';
import { MailService, type MailChatMessage } from '../mail/mail.service.js';
import { RedisBridgeService } from '../realtime/redis-bridge.service.js';
import { SitesService } from '../sites/sites.service.js';
import { UsersService } from '../users/users.service.js';
import type { UserDocument } from '../users/user.schema.js';
import { NotificationRecipientsService } from './notification-recipients.service.js';
import { NotificationsService } from './notifications.service.js';
import { UNKNOWN_VISITOR_LABEL, inboxUrl } from './notifications.types.js';

/** One sweep a minute is enough for a five-minute threshold. */
const TICK_MS = 60_000;

/** Staff are told after the visitor has waited this long by default. */
const DEFAULT_MISSED_MINUTES = 5;

/** An agent streak must be at least this old before the visitor is mailed. */
const REPLY_GRACE_MS = 2 * 60_000;

/** Bounded work per sweep, so a backlog cannot stall the process. */
const BATCH_LIMIT = 50;

/**
 * The reply sweep pages through its backlog by cursor, because a few rows it
 * must leave alone (visitor reading, presence unknown) would otherwise sit at
 * the head of the sort order and use up every batch of every tick.
 */
const MAX_PAGES_PER_SWEEP = 10;

/** A streak older than a week is history, not something to mail anybody about. */
const STREAK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** How much of the thread each mail quotes. */
const MISSED_QUOTE_LIMIT = 5;
const REPLY_QUOTE_LIMIT = 10;

/**
 * The clock behind the "missed chat" bell and the two mail flows.
 *
 * Claim-then-notify: a row is first stamped (`missedNotifiedAt` /
 * `visitorEmailedAt`) with a conditional update, and only the caller that won
 * that update notifies anybody. Two instances racing therefore produce one
 * message, not two.
 *
 * This assumes a single api instance running the interval. The claims make the
 * *effects* safe if a second instance is started, but a real scale-out should
 * still add a lease so the two sweeps do not duplicate each other's queries.
 */
@Injectable()
export class NotificationSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messages: Model<MessageDocument>,
    @InjectModel(Visitor.name)
    private readonly visitors: Model<VisitorDocument>,
    private readonly config: ConfigService,
    private readonly sites: SitesService,
    private readonly users: UsersService,
    private readonly recipients: NotificationRecipientsService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisBridgeService,
    private readonly mail: MailService,
  ) {}

  onModuleInit(): void {
    // The suite drives the sweeps itself; a live interval would only add noise.
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One sweep. Guarded so a slow batch never overlaps with the next tick. */
  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.guarded('missed chats', () => this.processMissedChats(now));
      await this.guarded('visitor replies', () => this.processVisitorReplies(now));
    } finally {
      this.running = false;
    }
  }

  private async guarded(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error: unknown) {
      // A failing sweep must not kill the interval.
      this.logger.warn(`Sweep (${label}) failed: ${describe(error)}`);
    }
  }

  /**
   * A visitor has been waiting longer than the threshold with nobody replying.
   *
   * The conversation's tail fields answer the question in one indexed query:
   * `status: open`, the last message is the visitor's, and the streak has not
   * been stamped yet. An agent reply clears `missedNotifiedAt`, so a new answer
   * followed by a new question rings again.
   *
   * No starvation: every row the query returns is either claimed (and then
   * leaves the queue via `missedNotifiedAt`) or lost the claim to a concurrent
   * write, which also changes the row. A thread whose site vanished keeps its
   * stamp and is simply skipped.
   */
  async processMissedChats(now: Date = new Date()): Promise<void> {
    const minutes = this.missedChatMinutes();
    const cutoff = new Date(now.getTime() - minutes * 60_000);

    const waiting = await this.conversations
      .find({
        status: 'open',
        lastMessageSenderKind: 'visitor',
        lastVisitorMessageAt: { $lte: cutoff },
        missedNotifiedAt: null,
      })
      .sort({ lastVisitorMessageAt: 1 })
      .limit(BATCH_LIMIT)
      .exec();

    for (const conversation of waiting) {
      if (!conversation.lastVisitorMessageAt) {
        continue;
      }

      // The claim repeats the whole filter plus this exact tail: a visitor
      // message that lands mid-sweep changes `lastVisitorMessageAt` and the
      // update misses, leaving the newer message for the next sweep.
      const claimed = await this.conversations
        .findOneAndUpdate(
          {
            _id: conversation._id,
            status: 'open',
            lastMessageSenderKind: 'visitor',
            lastVisitorMessageAt: conversation.lastVisitorMessageAt,
            missedNotifiedAt: null,
          },
          { $set: { missedNotifiedAt: now } },
          { returnDocument: 'after' },
        )
        .exec();

      if (!claimed) {
        continue;
      }

      try {
        await this.notifyMissed(claimed, now);
      } catch (error: unknown) {
        this.logger.warn(
          `Missed-chat delivery for ${String(claimed._id)} failed: ${describe(error)}`,
        );
      }
    }
  }

  /**
   * The agent answered and the visitor has not looked at the thread since,
   * because their widget is closed. Mails them the replies instead.
   *
   * Presence decides: `null` (Redis down, no fresh heartbeat) defers to the
   * next sweep rather than guess, and `true` means the visitor is reading, so
   * nothing is mailed.
   *
   * Nothing a sweep skips may keep the queue blocked: rows that can never
   * qualify leave it (see below), and the deferred ones (presence unknown, or
   * the visitor reading right now) are walked past by paging, not by being
   * picked over and over at the head of the sort order. A closed thread is no
   * exception — the agent replying and then closing it is exactly the case the
   * visitor most needs the mail for.
   */
  async processVisitorReplies(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - REPLY_GRACE_MS);
    // A week-old streak is not news; leaving it in the queue would mean a
    // never-ending backlog of rows that no longer matter.
    const floor = new Date(now.getTime() - STREAK_MAX_AGE_MS);

    // "Unread" is part of the query rather than a check after fetching, so a
    // row that can never be mailed does not consume a slot in the batch.
    // `$eq` against null is true for a missing field too.
    const unread: Record<string, unknown> = {
      $expr: {
        $or: [
          { $eq: ['$visitorLastReadAt', null] },
          { $lt: ['$visitorLastReadAt', '$firstUnansweredAgentAt'] },
        ],
      },
    };

    let cursor: { at: Date; id: unknown } | null = null;

    for (let page = 0; page < MAX_PAGES_PER_SWEEP; page += 1) {
      const filter: Record<string, unknown> = {
        firstUnansweredAgentAt: { $gt: floor, $lte: cutoff },
        visitorEmailedAt: null,
        ...unread,
      };

      if (cursor) {
        // Keyset pagination on (firstUnansweredAgentAt, _id), the same order as
        // the sort, so rows shifted by concurrent writes cannot be skipped.
        filter.$or = [
          { firstUnansweredAgentAt: { $gt: cursor.at } },
          { firstUnansweredAgentAt: cursor.at, _id: { $gt: cursor.id } },
        ];
      }

      const streaks = await this.conversations
        .find(filter)
        .sort({ firstUnansweredAgentAt: 1, _id: 1 })
        .limit(BATCH_LIMIT)
        .exec();

      for (const conversation of streaks) {
        await this.considerStreak(conversation, now);
      }

      if (streaks.length < BATCH_LIMIT) {
        return;
      }

      const last = streaks[streaks.length - 1];

      if (!last.firstUnansweredAgentAt) {
        return;
      }

      cursor = { at: last.firstUnansweredAgentAt, id: last._id };
    }
  }

  /** One row of the reply queue: mail it, defer it, or retire it. */
  private async considerStreak(
    conversation: ConversationDocument,
    now: Date,
  ): Promise<void> {
    if (!conversation.firstUnansweredAgentAt) {
      return;
    }

    // The query already asks for unread streaks; this repeats the test so a row
    // that slipped through (a read landing between the query and here) costs no
    // visitor lookup and no Redis round trip.
    if (
      conversation.visitorLastReadAt &&
      time(conversation.visitorLastReadAt) >= time(conversation.firstUnansweredAgentAt)
    ) {
      return;
    }

    const visitor = await this.visitorOf(conversation);
    const email = visitor?.email?.trim();

    if (!email) {
      // No address to mail means the streak can never qualify. Retire it (the
      // same "streak handled" marker a mail would set) so it stops occupying
      // the batch, and the next visitor message clears it as usual.
      await this.retireStreak(conversation, now);
      return;
    }

    const connected = await this.redis.isVisitorConnected(
      String(conversation._id),
    );

    if (connected === null || connected === true) {
      // Unknown presence is deferred, never treated as offline; a visitor who
      // is reading needs no mail. Both stay in the queue for a later sweep.
      return;
    }

    const replies = await this.replyMessages(conversation);

    if (replies.messages.length === 0) {
      return;
    }

    const claimed = await this.conversations
      .findOneAndUpdate(
        {
          _id: conversation._id,
          firstUnansweredAgentAt: conversation.firstUnansweredAgentAt,
          visitorEmailedAt: null,
          $or: [
            { visitorLastReadAt: null },
            { visitorLastReadAt: { $lt: conversation.firstUnansweredAgentAt } },
          ],
        },
        { $set: { visitorEmailedAt: now } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!claimed) {
      return;
    }

    try {
      const site = await this.sites.findById(String(claimed.siteId));

      if (!site) {
        return;
      }

      await this.mail.sendVisitorReplies({
        to: email,
        siteName: site.name,
        agentName: replies.agentName,
        messages: replies.messages,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Visitor reply mail for ${String(claimed._id)} failed: ${describe(error)}`,
      );
    }
  }

  /**
   * Marks a streak as handled without mailing: `visitorEmailedAt` is the same
   * marker a sent mail sets, so the row leaves the queue and a later sweep
   * cannot pick it up again. CAS on the streak so a visitor message arriving
   * mid-sweep (which clears `firstUnansweredAgentAt`) is not overwritten.
   */
  private async retireStreak(
    conversation: ConversationDocument,
    now: Date,
  ): Promise<void> {
    await this.conversations
      .findOneAndUpdate(
        {
          _id: conversation._id,
          firstUnansweredAgentAt: conversation.firstUnansweredAgentAt,
          visitorEmailedAt: null,
        },
        { $set: { visitorEmailedAt: now } },
      )
      .exec();
  }

  /** Bell + mail for one claimed conversation. */
  private async notifyMissed(
    conversation: ConversationDocument,
    now: Date,
  ): Promise<void> {
    const conversationId = String(conversation._id);
    const projectId = String(conversation.siteId);
    const site = await this.sites.findById(projectId);

    if (!site) {
      return;
    }

    const visitor = await this.visitorOf(conversation);
    const visitorLabel =
      visitor?.name?.trim() || visitor?.email?.trim() || UNKNOWN_VISITOR_LABEL;

    const waited = Math.max(
      1,
      Math.floor(
        (now.getTime() - time(conversation.lastVisitorMessageAt)) / 60_000,
      ),
    );
    const stamp = time(conversation.lastVisitorMessageAt);
    const recipients = await this.missedRecipients(conversation);

    for (const user of recipients) {
      const userId = String(user._id);

      try {
        await this.notifications.createOnce({
          userId,
          projectId,
          conversationId,
          kind: 'missed',
          body: `${visitorLabel} đã chờ ${waited} phút`,
          // One bell per wait, not per sweep: the timestamp of the message that
          // started it is the natural key.
          dedupeKey: `missed:${conversationId}:${stamp}`,
        });
      } catch (error: unknown) {
        this.logger.warn(
          `Missed bell for ${userId} in ${conversationId} failed: ${describe(error)}`,
        );
      }
    }

    const mailRecipients = recipients.filter(
      (user) => user.emailMissed !== false && Boolean(user.email),
    );

    if (mailRecipients.length === 0) {
      return;
    }

    const messages = await this.waitingMessages(conversation);
    const url = `${this.adminUrl()}${inboxUrl(conversationId)}`;

    for (const user of mailRecipients) {
      try {
        await this.mail.sendMissedChat({
          to: user.email,
          agentName: user.name,
          visitorLabel,
          siteName: site.name,
          messages,
          url,
        });
      } catch (error: unknown) {
        this.logger.warn(
          `Missed mail to ${String(user._id)} failed: ${describe(error)}`,
        );
      }
    }
  }

  /**
   * The holder when there is one and they can still open the project;
   * otherwise whoever's own scope covers an unclaimed thread.
   */
  private async missedRecipients(
    conversation: ConversationDocument,
  ): Promise<UserDocument[]> {
    const assignedAgentId = conversation.assignedAgentId
      ? String(conversation.assignedAgentId)
      : null;

    if (assignedAgentId) {
      const agent = await this.users.findById(assignedAgentId);
      const access = agent
        ? await this.sites.accessFor(String(conversation.siteId), assignedAgentId)
        : 'none';

      if (agent && access !== 'none') {
        return [agent];
      }
    }

    return this.recipients.forConversationInScope(conversation);
  }

  /**
   * The visitor's messages since the last agent answer, newest five, oldest
   * first so the mail reads like the thread.
   */
  private async waitingMessages(
    conversation: ConversationDocument,
  ): Promise<MailChatMessage[]> {
    const filter: Record<string, unknown> = {
      conversationId: conversation._id,
      senderKind: 'visitor',
    };

    if (conversation.lastAgentMessageAt) {
      filter.createdAt = { $gt: conversation.lastAgentMessageAt };
    }

    const rows = await this.messages
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(MISSED_QUOTE_LIMIT)
      .exec();

    return rows.reverse().map(toMailMessage);
  }

  /**
   * The agent's replies since the visitor's last message. Internal notes live in
   * their own collection and `senderKind: 'agent'` excludes system notes, so a
   * quoted reply is always something the visitor may see.
   */
  private async replyMessages(
    conversation: ConversationDocument,
  ): Promise<{ messages: MailChatMessage[]; agentName?: string }> {
    const filter: Record<string, unknown> = {
      conversationId: conversation._id,
      senderKind: 'agent',
    };

    if (conversation.lastVisitorMessageAt) {
      filter.createdAt = { $gt: conversation.lastVisitorMessageAt };
    }

    const rows = await this.messages
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(REPLY_QUOTE_LIMIT)
      .exec();

    const ordered = rows.reverse();

    return {
      messages: ordered.map(toMailMessage),
      agentName: senderNameOf(ordered[ordered.length - 1]),
    };
  }

  private async visitorOf(
    conversation: ConversationDocument,
  ): Promise<VisitorDocument | null> {
    if (!Types.ObjectId.isValid(String(conversation.visitorId))) {
      return null;
    }

    return this.visitors.findById(conversation.visitorId).exec();
  }

  private missedChatMinutes(): number {
    const raw = Number(this.config.get<string>('MISSED_CHAT_MINUTES'));

    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MISSED_MINUTES;
  }

  private adminUrl(): string {
    return (this.config.get<string>('ADMIN_URL') || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }
}

function time(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

/** Documents and the plain objects the tests build both satisfy this. */
function toMailMessage(message: MessageDocument): MailChatMessage {
  const row = message as unknown as {
    body?: string;
    createdAt?: Date | string;
    attachments?: unknown;
  };
  const attachments = serializeAttachments(row.attachments);

  return {
    text: row.body ?? '',
    createdAt: row.createdAt ?? new Date(0),
    // Only when present, so text-only quotes keep their old shape.
    ...(attachments.length ? { attachments } : {}),
  };
}

/** Who wrote a row, when the record carries a name; otherwise nobody is named. */
function senderNameOf(message: unknown): string | undefined {
  const row = message as { senderName?: string } | undefined;
  return row?.senderName?.trim() || undefined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
