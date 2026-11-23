import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ConversationDocument } from '../chat/conversation.schema.js';
import { Visitor, type VisitorDocument } from '../chat/visitor.schema.js';
import { RealtimeBusService } from '../realtime/realtime-bus.service.js';
import {
  Notification,
  toNotificationView,
  type NotificationDocument,
} from './notification.schema.js';
import { NotificationRecipientsService } from './notification-recipients.service.js';
import { PushService } from './push.service.js';
import {
  NOTIFICATION_TITLES,
  UNKNOWN_VISITOR_LABEL,
  inboxUrl,
  type NotificationKind,
  type NotificationMessageEvent,
  type NotificationView,
} from './notifications.types.js';

export interface NotificationPage {
  items: NotificationView[];
  unreadCount: number;
  nextCursor: string | null;
}

export interface CreateNotificationInput {
  userId: string;
  projectId: string;
  conversationId?: string | null;
  ticketId?: string | null;
  kind: NotificationKind;
  body: string;
  /** What makes this write idempotent across racing processes. */
  dedupeKey: string;
}

/** Upper bound for one page of the bell; the panel asks for 20. */
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

/** The two fields a push needs; the rest is fixed by the wire contract. */
interface PushInput {
  title: string;
  body: string;
}

/**
 * The bell. One row per person per event, written with a unique `dedupeKey` so
 * that two processes handling the same visitor message cannot both insert.
 *
 * Everything the outside world does with a new bell funnels through
 * `deliver()`: today that is the socket emit, and S2 extends it there to also
 * send a push. Nothing else in this service should grow a second delivery path.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Visitor.name)
    private readonly visitorModel: Model<VisitorDocument>,
    private readonly recipients: NotificationRecipientsService,
    private readonly bus: RealtimeBusService,
    // Optional so the many specs that build this service without a push
    // provider keep working; production always supplies it.
    @Optional() private readonly push?: PushService,
  ) {}

  /**
   * Inserts one bell, or returns null when this event was already recorded.
   *
   * The duplicate-key error is the normal path, not a failure: it is exactly
   * what makes a retried or concurrently-processed message harmless.
   */
  async createOnce(
    input: CreateNotificationInput,
    options: { push?: boolean } = {},
  ): Promise<NotificationView | null> {
    if (!Types.ObjectId.isValid(input.userId)) {
      return null;
    }

    let created: NotificationDocument;
    try {
      created = await this.notificationModel.create({
        userId: new Types.ObjectId(input.userId),
        projectId: new Types.ObjectId(input.projectId),
        conversationId: input.conversationId
          ? new Types.ObjectId(input.conversationId)
          : null,
        ticketId:
          input.ticketId && Types.ObjectId.isValid(input.ticketId)
            ? new Types.ObjectId(input.ticketId)
            : null,
        kind: input.kind,
        title: NOTIFICATION_TITLES[input.kind],
        body: input.body.slice(0, 500),
        dedupeKey: input.dedupeKey,
      });
    } catch (error: unknown) {
      if (isDuplicateKey(error)) {
        return null;
      }
      throw error;
    }

    const view = toNotificationView(created);
    // Only a row that actually landed is announced, so the bell cannot show an
    // item the unique index rejected.
    void this.deliver(input.userId, view, options.push ?? true);

    return view;
  }

  /**
   * A visitor wrote in a conversation the person is in scope for. Sends
   * `notification:message` to everyone whose own preferences cover the thread,
   * and — only when this message is what started the conversation (a brand new
   * thread, or a closed one the visitor just revived) — also one
   * `conversation_new` bell per recipient.
   *
   * The per-message event deliberately creates no bell row on its own: the
   * inbox badge already covers per-message noise.
   */
  async onVisitorMessage(input: {
    conversation: ConversationDocument;
    messageId: string;
    preview: string;
    createdAt: Date;
    /** True when this message is the first one in a new or reopened thread. */
    startsConversation?: boolean;
  }): Promise<void> {
    const { conversation } = input;
    const recipients = await this.recipients.forConversationInScope(conversation);

    if (recipients.length === 0) {
      return;
    }

    const visitorLabel = await this.visitorLabelOf(conversation);
    const conversationId = String(conversation._id);
    const projectId = String(conversation.siteId);

    for (const user of recipients) {
      const userId = String(user._id);
      let notificationId: string | undefined;
      /** The push for this recipient, sent once after the bell decision. */
      let push: PushInput | null = null;

      if (input.startsConversation) {
        try {
          // Keyed by the message that opened the thread: two processes (or a
          // retried send) can only record this once per person. Its own push is
          // suppressed here so the single push below carries the new-thread
          // wording instead of the per-message one.
          const view = await this.createOnce(
            {
              userId,
              projectId,
              conversationId,
              kind: 'conversation_new',
              body: `${visitorLabel} vừa bắt đầu một cuộc trò chuyện mới.`,
              dedupeKey: `conv_new:${input.messageId}`,
            },
            { push: false },
          );
          notificationId = view?.id;

          // A null view is the unique index saying somebody already rang this
          // bell for this message, so it must not buzz twice either.
          if (view) {
            push = { title: view.title, body: view.body };
          }
        } catch (error: unknown) {
          // The bell is best effort; the message itself already landed.
          this.logger.warn(
            `conversation_new not created for ${userId}: ${describe(error)}`,
          );
        }
      } else {
        push = {
          title: `Tin nhắn mới · ${visitorLabel}`,
          body: input.preview,
        };
      }

      if (push) {
        // Fire and forget: a slow push service must not hold up the message
        // path, and `sendToUser` already swallows its own failures.
        void Promise.resolve(
          this.push?.sendToUser(userId, {
            title: push.title,
            body: push.body,
            icon: '/favicon.ico',
            tag: conversationId,
            data: { url: inboxUrl(conversationId) },
          }),
        ).catch(() => undefined);
      }

      const event: NotificationMessageEvent = {
        messageId: input.messageId,
        conversationId,
        projectId,
        assignedAgentId: this.recipients.assignedAgentIdOf(conversation),
        visitorLabel,
        preview: input.preview,
        createdAt: input.createdAt.toISOString(),
        ...(notificationId ? { notificationId } : {}),
      };

      this.bus.emitToUser(userId, 'notification:message', event);
    }
  }

  /**
   * Someone else handed this person a thread. Self-assignment and the case
   * where the holder did not actually change produce nothing, so claiming your
   * own work never rings your own bell.
   */
  async onAssignment(input: {
    actorId: string;
    previousAgentId: string | null;
    nextAgentId: string | null;
    conversation: ConversationDocument;
    /** When the handover happened; the conversation's `updatedAt` by default. */
    assignedAt?: Date | string | null;
  }): Promise<NotificationView | null> {
    const next = input.nextAgentId;

    // Compare as strings: the actor and the previous holder arrive as strings
    // from the request while the conversation stores ObjectIds, so an
    // identity check would read a self-assignment as a real handover.
    const nextKey = next ? String(next) : null;
    const actorKey = input.actorId ? String(input.actorId) : null;
    const previousKey = input.previousAgentId
      ? String(input.previousAgentId)
      : null;

    if (!nextKey || nextKey === actorKey || nextKey === previousKey) {
      return null;
    }

    const recipients = await this.recipients.forAssignment(nextKey);
    const agent = recipients[0];

    if (!agent) {
      return null;
    }

    const visitorLabel = await this.visitorLabelOf(input.conversation);

    return this.createOnce({
      userId: nextKey,
      projectId: String(input.conversation.siteId),
      conversationId: String(input.conversation._id),
      kind: 'assigned',
      body: `${visitorLabel} vừa được giao cho bạn.`,
      // The conversation, the new holder and *when* it was handed over: a
      // replay of this write is a duplicate, a later handover to the same
      // person is a new event.
      dedupeKey: `assigned:${String(input.conversation._id)}:${nextKey}:${assignmentStamp(
        input.conversation,
        input.assignedAt,
      )}`,
    });
  }

  /**
   * The visitor left contact details. Deduped on the normalised details rather
   * than the submission, so saving the same name and email twice is one bell.
   */
  async onContactLeft(input: {
    conversation: ConversationDocument;
    contact: { name: string | null; email: string | null };
  }): Promise<NotificationView[]> {
    const normalized = [
      (input.contact.name ?? '').trim().toLowerCase(),
      (input.contact.email ?? '').trim().toLowerCase(),
    ]
      .filter(Boolean)
      .join('|');

    const recipients = await this.recipients.forContactLeft(input.conversation);
    const label =
      input.contact.name?.trim() ||
      input.contact.email?.trim() ||
      UNKNOWN_VISITOR_LABEL;

    const created: NotificationView[] = [];

    for (const user of recipients) {
      const view = await this.createOnce({
        userId: String(user._id),
        projectId: String(input.conversation.siteId),
        conversationId: String(input.conversation._id),
        kind: 'contact_left',
        body: `${label} để lại thông tin liên hệ.`,
        dedupeKey: `contact:${String(input.conversation._id)}:${normalized}`,
      });

      if (view) {
        created.push(view);
      }
    }

    return created;
  }

  /**
   * A ticket bell (new ticket for admins, or a ticket handed to someone).
   * Deduped per ticket and person; one person's failure never stops the rest.
   */
  async notifyTicket(input: {
    userIds: string[];
    kind: 'ticket_new' | 'ticket_assigned';
    projectId: string;
    conversationId: string;
    ticketId: string;
    body: string;
  }): Promise<void> {
    const userIds = [...new Set(input.userIds.map(String))];

    for (const userId of userIds) {
      try {
        await this.createOnce(
          {
            userId,
            projectId: input.projectId,
            conversationId: input.conversationId,
            ticketId: input.ticketId,
            kind: input.kind,
            body: input.body,
            // Each hand-over is its own event: being given the ticket back later
            // must ring again, so the assignment key carries the moment.
            dedupeKey:
              input.kind === 'ticket_assigned'
                ? `${input.kind}:${input.ticketId}:${userId}:${Date.now()}`
                : `${input.kind}:${input.ticketId}:${userId}`,
          },
          { push: true },
        );
      } catch (error: unknown) {
        this.logger.warn(
          `${input.kind} not created for ${userId}: ${describe(error)}`,
        );
      }
    }
  }

  /** Newest first, keyset paged on (createdAt, _id). */
  async listForUser(
    userId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<NotificationPage> {
    if (!Types.ObjectId.isValid(userId)) {
      return { items: [], unreadCount: 0, nextCursor: null };
    }

    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };

    const cursor = decodeCursor(options.before);
    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    // One extra row tells us whether an older page exists, without a count.
    const rows = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    return {
      items: page.map(toNotificationView),
      unreadCount: await this.unreadCount(userId),
      nextCursor:
        hasMore && page.length
          ? encodeCursor(page[page.length - 1])
          : null,
    };
  }

  /** Marks one row read. Returns null when it is not the caller's own row. */
  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<{ unreadCount: number } | null> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(notificationId)
    ) {
      return null;
    }

    const updated = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(userId),
          readAt: null,
        },
        { $set: { readAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();

    // Already-read rows still answer, so a double click is not an error.
    const exists =
      updated ??
      (await this.notificationModel.exists({
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      }).exec());

    if (!exists) {
      return null;
    }

    const unreadCount = await this.unreadCount(userId);
    this.bus.emitToUser(userId, 'notification:read', {
      id: notificationId,
      all: false,
      unreadCount,
    });

    return { unreadCount };
  }

  async markAllRead(userId: string): Promise<{ unreadCount: number }> {
    if (!Types.ObjectId.isValid(userId)) {
      return { unreadCount: 0 };
    }

    await this.notificationModel
      .updateMany(
        { userId: new Types.ObjectId(userId), readAt: null },
        { $set: { readAt: new Date() } },
      )
      .exec();

    this.bus.emitToUser(userId, 'notification:read', {
      id: null,
      all: true,
      unreadCount: 0,
    });

    return { unreadCount: 0 };
  }

  async unreadCount(userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) {
      return 0;
    }

    return this.notificationModel
      .countDocuments({ userId: new Types.ObjectId(userId), readAt: null })
      .exec();
  }

  /**
   * The single delivery point: the person's own socket room, then — for the
   * recipients a caller has not already pushed to — their devices. A bell
   * created by any process reaches a closed tab the same way.
   */
  private async deliver(
    userId: string,
    view: NotificationView,
    push = true,
  ): Promise<void> {
    try {
      this.bus.emitToUser(userId, 'notification:new', view);
    } catch {
      // A missed emit is not worth failing the write over; the REST list and
      // the next page load still show the row.
      this.logger.warn(`notification:new not delivered to ${userId}`);
    }

    if (!push) {
      return;
    }

    try {
      // Fire and forget: `sendToUser` never throws, and awaiting it would put
      // an external HTTP round trip in the middle of the message path.
      void Promise.resolve(
        this.push?.sendToUser(userId, {
          title: view.title,
          body: view.body,
          icon: '/favicon.ico',
          tag: view.ticketId ?? view.conversationId ?? view.id,
          data: {
            url: view.ticketId
              ? `/tickets?ticket=${view.ticketId}`
              : inboxUrl(view.conversationId),
          },
        }),
      ).catch(() => undefined);
    } catch {
      this.logger.warn(`push not scheduled for ${userId}`);
    }
  }

  /** What the inbox calls this visitor: their name, email, or a neutral label. */
  private async visitorLabelOf(
    conversation: ConversationDocument,
  ): Promise<string> {
    if (!Types.ObjectId.isValid(String(conversation.visitorId))) {
      return UNKNOWN_VISITOR_LABEL;
    }

    const visitor = await this.visitorModel
      .findById(conversation.visitorId)
      .exec();

    return (
      visitor?.name?.trim() ||
      visitor?.email?.trim() ||
      UNKNOWN_VISITOR_LABEL
    );
  }
}

/**
 * A stable value for "this handover". `updatedAt` is written by the same atomic
 * update that changed the assignee, so a replay of the same assignment carries
 * the same stamp while a later handover carries a new one.
 */
function assignmentStamp(
  conversation: ConversationDocument,
  explicit?: Date | string | null,
): string {
  const candidate = explicit ?? (conversation.get('updatedAt') as Date | undefined);
  const date = candidate instanceof Date ? candidate : new Date(candidate ?? 0);

  return Number.isFinite(date.getTime()) ? String(date.getTime()) : '0';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function encodeCursor(row: NotificationDocument): string {
  return Buffer.from(
    JSON.stringify([row.get('createdAt').toISOString(), String(row._id)]),
  ).toString('base64url');
}

function decodeCursor(
  cursor: string | undefined,
): { createdAt: Date; id: Types.ObjectId } | null {
  if (!cursor) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );

    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string' ||
      !Types.ObjectId.isValid(value[1])
    ) {
      return null;
    }

    const createdAt = new Date(value[0]);

    return Number.isFinite(createdAt.getTime())
      ? { createdAt, id: new Types.ObjectId(value[1]) }
      : null;
  } catch {
    return null;
  }
}
