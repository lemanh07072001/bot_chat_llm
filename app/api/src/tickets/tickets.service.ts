import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId, type QueryFilter } from 'mongoose';
import { serializeAttachments } from '../attachments/attachment.types.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { ChatService } from '../chat/chat.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeBusService } from '../realtime/realtime-bus.service.js';
import { SitesService } from '../sites/sites.service.js';
import { agentProfileOf } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { Counter, Ticket } from './ticket.schema.js';
import {
  TICKETS_PAGE_SIZE,
  TICKET_STATUSES,
  type CreateTicketInput,
  type TicketActor,
  type TicketListQuery,
  type TicketListResult,
  type TicketStatus,
  type TicketView,
} from './tickets.types.js';

/** What a lean ticket read looks like, timestamps included. */
type TicketRecord = Ticket & { _id: Types.ObjectId };

const TICKET_COUNTER_ID = 'ticket';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectModel(Ticket.name) private readonly tickets: Model<Ticket>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly chat: ChatService,
    private readonly sites: SitesService,
    private readonly users: UsersService,
    private readonly bus: RealtimeBusService,
    private readonly attachments: AttachmentsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly mail?: MailService,
  ) {}

  async create(input: CreateTicketInput): Promise<TicketView> {
    let number = await this.nextNumber();
    try {
      return await this.insert(input, number);
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error;
      // The counter fell behind the tickets (lost or reset): lift it past the
      // highest number in use and take the next one.
      const highest = await this.tickets.findOne().sort({ number: -1 }).select({ number: 1 }).lean().exec();
      await this.counters
        .updateOne({ _id: TICKET_COUNTER_ID }, { $max: { seq: highest?.number ?? 0 } }, { upsert: true })
        .exec();
      number = await this.nextNumber();
      return this.insert(input, number);
    }
  }

  private async nextNumber(): Promise<number> {
    const counter = await this.counters
      .findOneAndUpdate(
        { _id: TICKET_COUNTER_ID },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();
    return counter!.seq;
  }

  private async insert(input: CreateTicketInput, number: number): Promise<TicketView> {
    const created = await this.tickets.create({
      number,
      siteId: new Types.ObjectId(input.siteId),
      conversationId: new Types.ObjectId(input.conversationId),
      visitorId: new Types.ObjectId(input.visitorId),
      name: input.name,
      email: input.email,
      message: input.message,
      attachments: input.attachments ?? [],
      status: 'new',
      assigneeId: null,
      replies: [],
    });
    const record = created.toObject() as TicketRecord;

    // The ticket is stored: nothing below may fail the call, or the caller
    // would treat it as a failed insert (retry, release its attachments).
    try {
      const adminIds = await this.users.listAdminIds();
      await this.notify({
        userIds: adminIds,
        kind: 'ticket_new',
        projectId: input.siteId,
        conversationId: input.conversationId,
        ticketId: String(record._id),
        body: `#${record.number} · ${input.name || input.email}: ${input.message}`.slice(0, 500),
      });
      this.emitChanged(record, adminIds);
    } catch (error) {
      this.logger.warn(`Ticket ${String(record._id)}: post-insert fan-out failed: ${String(error)}`);
    }

    try {
      return await this.toView(record);
    } catch (error) {
      this.logger.warn(`Ticket ${String(record._id)}: view lookup failed: ${String(error)}`);
      return this.viewOf(record, new Map(), new Map());
    }
  }

  async list(actor: TicketActor, query: TicketListQuery): Promise<TicketListResult> {
    const empty: TicketListResult = { items: [], total: 0, counts: { new: 0, in_progress: 0, done: 0 } };
    const base: QueryFilter<Ticket> = {};

    if (actor.isAdmin) {
      if (query.assigneeId) {
        if (query.assigneeId === 'none') base.assigneeId = null;
        else if (isValidObjectId(query.assigneeId)) base.assigneeId = new Types.ObjectId(query.assigneeId);
        else return empty;
      }
    } else {
      // Agents only ever see what is theirs; any assignee filter is ignored.
      if (!isValidObjectId(actor.userId)) return empty;
      base.assigneeId = new Types.ObjectId(actor.userId);
    }

    if (query.siteId) {
      if (!isValidObjectId(query.siteId)) return empty;
      base.siteId = new Types.ObjectId(query.siteId);
    }

    const q = query.q?.trim();
    if (q) {
      const pattern = new RegExp(escapeRegex(q.slice(0, 200)), 'i');
      base.$or = [{ name: pattern }, { email: pattern }, { message: pattern }];
    }

    const filter: QueryFilter<Ticket> = isTicketStatus(query.status) ? { ...base, status: query.status } : base;
    const page = Math.max(1, Math.floor(Number(query.page) || 1));

    const [records, total, ...counts] = await Promise.all([
      this.tickets
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * TICKETS_PAGE_SIZE)
        .limit(TICKETS_PAGE_SIZE)
        .lean()
        .exec(),
      this.tickets.countDocuments(filter).exec(),
      ...TICKET_STATUSES.map((status) => this.tickets.countDocuments({ ...base, status }).exec()),
    ]);

    return {
      items: await this.toViews(records as TicketRecord[]),
      total,
      counts: { new: counts[0] ?? 0, in_progress: counts[1] ?? 0, done: counts[2] ?? 0 },
    };
  }

  async get(actor: TicketActor, id: string): Promise<TicketView> {
    const ticket = await this.load(id);
    if (!this.canHandle(actor, ticket)) {
      throw new ForbiddenException('Bạn không có quyền xem ticket này.');
    }
    return this.toView(ticket);
  }

  async assign(actor: TicketActor, id: string, agentId: string | null): Promise<TicketView> {
    if (!actor.isAdmin) {
      throw new ForbiddenException('Chỉ quản trị viên mới được giao ticket.');
    }
    const ticket = await this.load(id);

    if (agentId !== null) {
      if (!isValidObjectId(agentId) || !(await this.users.findById(agentId))) {
        throw new NotFoundException('Không tìm thấy nhân viên.');
      }
      if ((await this.sites.accessFor(String(ticket.siteId), agentId)) === 'none') {
        throw new ForbiddenException('Nhân viên này không có quyền truy cập website của ticket.');
      }
    }

    // The pre-image of the write itself, so a concurrent reassign cannot hide
    // who just lost the ticket.
    const before = await this.tickets
      .findOneAndUpdate(
        { _id: ticket._id },
        { $set: { assigneeId: agentId ? new Types.ObjectId(agentId) : null } },
        { returnDocument: 'before' },
      )
      .lean()
      .exec();
    if (!before) {
      throw new NotFoundException('Không tìm thấy ticket.');
    }
    const previous = before.assigneeId ? String(before.assigneeId) : null;
    const updated = await this.load(id);

    if (agentId && agentId !== previous) {
      await this.notify({
        userIds: [agentId],
        kind: 'ticket_assigned',
        projectId: String(updated.siteId),
        conversationId: String(updated.conversationId),
        ticketId: String(updated._id),
        body: `#${updated.number} · ${updated.name || updated.email}: ${updated.message}`.slice(0, 500),
      });
    }

    this.emitChanged(updated, await this.users.listAdminIds(), previous ? [previous] : []);
    return this.toView(updated);
  }

  async setStatus(actor: TicketActor, id: string, status: TicketStatus): Promise<TicketView> {
    if (!isTicketStatus(status)) {
      throw new BadRequestException('Trạng thái ticket không hợp lệ.');
    }
    const ticket = await this.load(id);
    this.assertCanAct(actor, ticket);

    const updated = await this.update(id, { $set: { status } }, this.handlerFilter(actor));
    this.emitChanged(updated, await this.users.listAdminIds());
    return this.toView(updated);
  }

  async reply(
    actor: TicketActor,
    id: string,
    body: string,
    attachmentIds?: string[],
  ): Promise<TicketView> {
    body = (body ?? '').trim();
    if (!body && !attachmentIds?.length) {
      throw new BadRequestException('Nhập nội dung hoặc đính kèm ảnh.');
    }

    const ticket = await this.load(id);
    this.assertCanAct(actor, ticket);

    const siteId = String(ticket.siteId);
    const conversationId = String(ticket.conversationId);
    // After the permission check, owned by the replying staff member.
    const { attachments, claimedAt } = await this.attachments.claimWithStamp(attachmentIds, {
      kind: 'agent',
      id: actor.userId,
      siteId,
    });

    // The ticket is written first: a failure after this point leaves the answer
    // recorded, and the chat copy below is keyed so it can never be posted twice.
    const replyKey = new Types.ObjectId().toHexString();
    let authorName: string;
    let user: Awaited<ReturnType<UsersService['findById']>>;
    let siteName: string;
    let updated: TicketRecord;
    try {
      user = await this.users.findById(actor.userId);
      authorName = (actor.name || user?.name || 'Nhân viên').slice(0, 100);
      const site = await this.sites.findById(siteId);
      siteName = site?.name ?? '';

      updated = await this.update(
        id,
        {
          $push: {
            replies: {
              authorId: new Types.ObjectId(actor.userId),
              authorName,
              body,
              attachments,
              createdAt: new Date(),
            },
          },
          // The first answer means somebody is on it.
          ...(ticket.status === 'new' ? { $set: { status: 'in_progress' as TicketStatus } } : {}),
        },
        this.handlerFilter(actor),
      );
    } catch (error) {
      await this.attachments
        .release(attachments.map((attachment) => attachment.id), claimedAt)
        .catch(() => undefined);
      throw error;
    }

    // The visitor reads the answer in the widget, on the same thread.
    const conversation = await this.chat.findConversationById(conversationId);
    if (conversation) {
      const message = await this.chat.appendMessage({
        conversationId,
        siteId,
        senderKind: 'agent',
        senderId: actor.userId,
        senderName: authorName,
        body,
        attachments,
        externalId: `ticket-reply:${id}:${replyKey}`,
      });
      // The ticket mail below already carries this answer; the scheduler's
      // "agent replied" mail would repeat it.
      await this.chat.markVisitorEmailed(conversationId);
      const sender = user
        ? agentProfileOf(user)
        : { id: actor.userId, name: authorName, jobTitle: null, avatarUrl: null };
      this.bus.emitToConversation(conversationId, 'message:new', { ...message.toJSON(), sender });
      const updatedConversation = await this.chat.findConversationById(conversationId);
      const visitor = await this.chat.findVisitorById(String(conversation.visitorId));
      if (updatedConversation) this.bus.emitToSite(siteId, 'conversation:updated', {
        ...updatedConversation.toJSON(), siteName,
        visitor: visitor ? { id: String(visitor._id), name: visitor.name ?? null, email: visitor.email ?? null } : null,
      });
    }

    try {
      await this.mail?.sendTicketReply({
        to: ticket.email,
        siteName,
        agentName: authorName,
        ticketNumber: ticket.number,
        original: ticket.message,
        body,
        attachments,
      });
    } catch (error) {
      this.logger.warn(`Ticket #${ticket.number}: reply mail failed: ${String(error)}`);
    }

    this.emitChanged(updated, await this.users.listAdminIds());
    return this.toView(updated);
  }

  async summary(actor: TicketActor): Promise<{ badge: number }> {
    if (actor.isAdmin) {
      return { badge: await this.tickets.countDocuments({ status: 'new' }).exec() };
    }
    if (!isValidObjectId(actor.userId)) return { badge: 0 };
    const badge = await this.tickets
      .countDocuments({ assigneeId: new Types.ObjectId(actor.userId), status: { $ne: 'done' } })
      .exec();
    return { badge };
  }

  private async load(id: string): Promise<TicketRecord> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Không tìm thấy ticket.');
    }
    const ticket = await this.tickets.findById(id).lean().exec();
    if (!ticket) {
      throw new NotFoundException('Không tìm thấy ticket.');
    }
    return ticket as TicketRecord;
  }

  /**
   * `extra` narrows the write to the state the permission check saw, so an
   * agent unassigned in between cannot still act on the ticket.
   */
  private async update(
    id: string,
    change: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ): Promise<TicketRecord> {
    const updated = await this.tickets
      .findOneAndUpdate({ _id: new Types.ObjectId(id), ...extra }, change, {
        returnDocument: 'after',
        runValidators: true,
      })
      .lean()
      .exec();
    if (!updated) {
      if (Object.keys(extra).length > 0 && (await this.tickets.exists({ _id: id }))) {
        throw new ForbiddenException('Ticket này không còn được giao cho bạn.');
      }
      throw new NotFoundException('Không tìm thấy ticket.');
    }
    return updated as TicketRecord;
  }

  /** Non-admins may only write while the ticket is still theirs. */
  private handlerFilter(actor: TicketActor): Record<string, unknown> {
    return actor.isAdmin ? {} : { assigneeId: new Types.ObjectId(actor.userId) };
  }

  private canHandle(actor: TicketActor, ticket: TicketRecord): boolean {
    return actor.isAdmin || (!!ticket.assigneeId && String(ticket.assigneeId) === actor.userId);
  }

  private assertCanAct(actor: TicketActor, ticket: TicketRecord): void {
    if (!this.canHandle(actor, ticket)) {
      throw new ForbiddenException('Bạn không có quyền xử lý ticket này.');
    }
  }

  private async notify(input: {
    userIds: string[];
    kind: 'ticket_new' | 'ticket_assigned';
    projectId: string;
    conversationId: string;
    ticketId: string;
    body: string;
  }): Promise<void> {
    if (input.userIds.length === 0) return;
    try {
      await this.notifications?.notifyTicket(input);
    } catch (error) {
      this.logger.warn(`Ticket ${input.ticketId}: ${input.kind} notification failed: ${String(error)}`);
    }
  }

  /** Every admin plus the current assignee (and any previous one) refetches. */
  private emitChanged(ticket: TicketRecord, adminIds: string[], extra: string[] = []): void {
    const recipients = new Set<string>([...adminIds, ...extra]);
    if (ticket.assigneeId) recipients.add(String(ticket.assigneeId));
    const payload = { id: String(ticket._id) };
    for (const userId of recipients) this.bus.emitToUser(userId, 'ticket:changed', payload);
  }

  private async toView(ticket: TicketRecord): Promise<TicketView> {
    const [view] = await this.toViews([ticket]);
    return view;
  }

  private async toViews(records: TicketRecord[]): Promise<TicketView[]> {
    const siteIds = [...new Set(records.map((r) => String(r.siteId)))];
    const assigneeIds = [
      ...new Set(records.flatMap((r) => (r.assigneeId ? [String(r.assigneeId)] : []))),
    ];

    const [sites, assignees] = await Promise.all([
      Promise.all(siteIds.map((id) => this.sites.findById(id))),
      assigneeIds.length ? this.users.findManyByIds(assigneeIds) : Promise.resolve([]),
    ]);
    const siteNames = new Map(siteIds.map((id, index) => [id, sites[index]?.name ?? '']));
    const assigneeNames = new Map(assignees.map((u) => [String(u._id), u.name]));

    return records.map((r) => this.viewOf(r, siteNames, assigneeNames));
  }

  private viewOf(
    r: TicketRecord,
    siteNames: Map<string, string>,
    assigneeNames: Map<string, string>,
  ): TicketView {
    const assigneeId = r.assigneeId ? String(r.assigneeId) : null;
    return {
      id: String(r._id),
      number: r.number,
      siteId: String(r.siteId),
      siteName: siteNames.get(String(r.siteId)) ?? '',
      conversationId: String(r.conversationId),
      visitorId: String(r.visitorId),
      name: r.name ?? null,
      email: r.email,
      message: r.message,
      attachments: serializeAttachments(r.attachments),
      status: r.status,
      assignee: assigneeId ? { id: assigneeId, name: assigneeNames.get(assigneeId) ?? '' } : null,
      replies: (r.replies ?? []).map((reply) => ({
        authorId: String(reply.authorId),
        authorName: reply.authorName,
        body: reply.body ?? '',
        attachments: serializeAttachments(reply.attachments),
        createdAt: new Date(reply.createdAt).toISOString(),
      })),
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  }
}
