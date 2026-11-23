import { HttpException, Logger, Optional } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './shared/chat/chat.service.js';
import {
  MESSAGE_MAX_LENGTH,
  REACTION_MAX_LENGTH,
  serializeReactions,
} from './shared/chat/message.schema.js';
import { WidgetService } from './shared/widget/widget.service.js';
import { SitesService } from './shared/sites/sites.service.js';
import { UsersService } from './shared/users/users.service.js';
import { agentProfileOf, type AgentProfile } from './shared/users/user.schema.js';
import {
  isAgentStatus,
  normalizeAgentStatus,
  type AgentStatus,
  type TeamStatus,
} from './shared/users/agent-status.js';
import { AgentRegistryService } from './shared/realtime/agent-registry.service.js';
import { VisitorRegistryService } from './shared/realtime/visitor-registry.service.js';
import { RealtimeBusService } from './shared/realtime/realtime-bus.service.js';
import { RedisBridgeService } from './shared/realtime/redis-bridge.service.js';
import { RateLimiterService } from './shared/realtime/rate-limiter.service.js';
import { conversationRoom, siteRoom, siteVisitorsRoom, userRoom, visitorRoom } from './shared/realtime/rooms.js';
import type { JwtPayload } from './shared/auth/jwt-payload.type.js';
import {
  AttachmentsService,
  INVALID_ATTACHMENT_MESSAGE,
  TOO_MANY_ATTACHMENTS_MESSAGE,
} from './shared/attachments/attachments.service.js';
import { MAX_ATTACHMENTS, type AttachmentView } from './shared/attachments/attachment.types.js';

/**
 * A public widget can be driven by anyone, so sends are capped. The key is the
 * visitor or the user, never the socket — a per-socket cap is sidestepped by
 * opening a second socket.
 */
const SEND_WINDOW_MS = 10_000;
const VISITOR_SEND_LIMIT = 10;
/** Staff type faster and are authenticated, so they get more headroom. */
const AGENT_SEND_LIMIT = 40;

/** Reactions are lighter than messages, but a tap-hold can still spam writes. */
const REACT_LIMIT = 20;

interface VisitorSocketData {
  kind: 'visitor';
  visitorId: string;
  siteId: string;
  conversationId: string;
}

interface AgentSocketData {
  /** Resolved from the database at handshake, never from the client. */
  profile: AgentProfile;
  kind: 'agent';
  userId: string;
  tokenVersion: number;
  name: string;
  /** What this person told visitors at handshake; changes come over the socket. */
  agentStatus: AgentStatus;
}

type SocketData = VisitorSocketData | AgentSocketData;

@WebSocketGateway({
  // Visitor sockets originate from whatever page embeds the widget. Safe for
  // the same reason as the HTTP widget routes: bearer tokens, no cookies.
  cors: { origin: true },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);
  private readonly presenceRevisions = new Map<string, number>();

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly widgetService: WidgetService,
    private readonly sitesService: SitesService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly agents: AgentRegistryService,
    private readonly visitors: VisitorRegistryService,
    private readonly bus: RealtimeBusService,
    private readonly rateLimiter: RateLimiterService,
    private readonly attachmentsService: AttachmentsService,
    @Optional() private readonly bridge?: RedisBridgeService,
  ) {}

  /** Hands the server to the bus so REST routes can broadcast too. */
  afterInit(server: Server): void {
    this.bus.setServer(server);
    this.agents.onPresenceChanged((siteId) => { void this.announcePresence([siteId]); });
  }
  async handleConnection(socket: Socket): Promise<void> {
    const token: unknown = socket.handshake.auth?.token;

    if (typeof token !== 'string' || !token) {
      socket.emit('error:auth', { message: 'A token is required' });
      socket.disconnect(true);
      return;
    }

    const identity = await this.authenticate(token);

    if (!identity) {
      socket.emit('error:auth', { message: 'Invalid token' });
      socket.disconnect(true);
      return;
    }

    socket.data = identity;

    if (identity.kind === 'agent') {
      const stillValid = async () => {
        const state = await this.usersService.findAuthState(identity.userId);
        return !!state && state.emailVerified && (state.tokenVersion ?? 0) === identity.tokenVersion;
      };
      const invalidate = () => {
        socket.emit('error:auth', { message: 'Phiên làm việc đã hết hiệu lực. Hãy đăng nhập lại.' });
        socket.disconnect(true);
      };
      // Validate packets as well as idle sockets: a password change must not
      // leave an already-connected old session able to send or read indefinitely.
      socket.use((_packet, next) => {
        stillValid().then((valid) => {
          if (valid) next(); else { invalidate(); next(new Error('Session revoked')); }
        }).catch(() => { invalidate(); next(new Error('Session validation failed')); });
      });
      const timer = setInterval(() => { void stillValid().then((valid) => { if (!valid) invalidate(); }).catch(invalidate); }, 3000);
      timer.unref();
      socket.once('disconnect', () => clearInterval(timer));
    }

    if (identity.kind === 'visitor') {
      await socket.join(conversationRoom(identity.conversationId));
      // Every socket of one visitor, without the agents watching the thread.
      await socket.join(visitorRoom(identity.conversationId));
      // One room per project for presence, so "nhân viên đang trực" reaches
      // every open widget of a project with a single emit.
      await socket.join(siteVisitorsRoom(identity.siteId));

      // Presence is what decides whether a push is worth sending, so it is
      // tracked per socket and collapsed per conversation on read.
      this.visitors.register(socket.id, identity.conversationId);

      socket.emit('ready', {
        kind: 'visitor',
        conversationId: identity.conversationId,
        ...(await this.presenceFor(identity.siteId)),
      });
      return;
    }

    // Staff see exactly the projects they belong to. The list comes from the
    // database on every connect, so revoked access does not survive a
    // reconnect, and changes mid-session are pushed by AgentRegistryService.
    const siteIds = await this.sitesService.accessibleSiteIds(identity.userId);

    for (const siteId of siteIds) {
      await socket.join(siteRoom(siteId));
    }

    // The bell and "assigned to you" are addressed to a person, not a project,
    // so they arrive whichever inbox this tab happens to have open.
    await socket.join(userRoom(identity.userId));

    // Another tab may have changed the status while this handshake awaited; its
    // sessions hold the current value, the token-time snapshot does not.
    const agentStatus = this.agents.statusForUser(identity.userId) ?? identity.agentStatus;

    this.agents.register(identity.userId, siteIds, socket, agentStatus);
    await this.announcePresence(siteIds);

    socket.emit('ready', {
      kind: 'agent',
      userId: identity.userId,
      siteIds,
      agentStatus,
    });
  }

  handleDisconnect(socket: Socket): void {
    const data = socket.data as SocketData | undefined;

    if (data?.kind === 'visitor') {
      this.visitors.unregister(socket.id);
      return;
    }

    if (data?.kind !== 'agent') {
      return;
    }

    // Read the rooms before unregistering, so the announcement knows which
    // projects to recalculate.
    const siteIds = this.agents.siteIdsForSocket(socket.id);

    this.agents.unregister(socket.id);
    void this.announcePresence(siteIds);
  }

  /** Resolves a handshake token to either a visitor or a staff identity. */
  private async authenticate(token: string): Promise<SocketData | null> {
    try {
      const visitor = await this.widgetService.verifyVisitorToken(token);
      return {
        kind: 'visitor',
        visitorId: visitor.sub,
        siteId: visitor.siteId,
        conversationId: visitor.conversationId,
      };
    } catch {
      // Not a visitor token; fall through to the staff check.
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      if (payload.scope !== undefined && payload.scope !== 'agent') {
        return null;
      }

      const user = await this.usersService.findById(payload.sub);

      if (!user || payload.ver !== (user.tokenVersion ?? 0)) {
        return null;
      }

      return {
        kind: 'agent',
        userId: String(user._id),
        tokenVersion: user.tokenVersion ?? 0,
        name: user.name,
        profile: agentProfileOf(user),
        agentStatus: normalizeAgentStatus(user.agentStatus),
      };
    } catch {
      return null;
    }
  }

  @SubscribeMessage('message:send')
  async handleMessageSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; error?: string; message?: Record<string, unknown> }> {
    const data = socket.data as SocketData | undefined;

    if (!data) {
      return { ok: false, error: 'Not authenticated' };
    }

    if (!this.consumeSendQuota(data)) {
      return {
        ok: false,
        error: 'Bạn đang gửi quá nhanh, chờ một chút rồi thử lại.',
      };
    }

    const body = this.readBody(payload);
    const attachmentIds = this.readAttachmentIds(payload);

    if (attachmentIds === null) {
      return { ok: false, error: INVALID_ATTACHMENT_MESSAGE };
    }

    if (attachmentIds.length > MAX_ATTACHMENTS) {
      return { ok: false, error: TOO_MANY_ATTACHMENTS_MESSAGE };
    }

    if (!body && attachmentIds.length === 0) {
      return { ok: false, error: 'Message body is required' };
    }

    // A visitor's conversation comes from its token, never from the payload, so
    // it can only ever write into its own thread.
    const conversationId =
      data.kind === 'visitor'
        ? data.conversationId
        : this.readConversationId(payload);

    if (!conversationId) {
      return { ok: false, error: 'conversationId is required' };
    }

    const conversation =
      await this.chatService.findConversationById(conversationId);

    if (!conversation) {
      return { ok: false, error: 'Conversation not found' };
    }

    const siteId = String(conversation.siteId);
    const site = await this.sitesService.findById(siteId);
    if (!site) return { ok: false, error: 'Conversation not found' };
    if (data.kind === 'visitor' && !site.active) { socket.emit('widget:maintenance', { maintenance: true }); return { ok: false, error: 'Hệ thống chat đang bảo trì. Vui lòng quay lại sau.' }; }

    // An agent may only write into a project they belong to. Checked against
    // the live subscription set, so access revoked a second ago already counts.
    if (data.kind === 'agent' && (!this.agents.mayRead(socket.id, siteId) || (await this.sitesService.accessFor(siteId, data.userId)) === 'none')) {
      return { ok: false, error: 'Conversation not found' };
    }

    // Claimed only after the access checks, with the owner taken from the
    // socket identity, so nobody can attach somebody else's upload.
    let attachments: AttachmentView[];
    let claimedAt: Date;
    try {
      ({ attachments, claimedAt } = await this.attachmentsService.claimWithStamp(
        attachmentIds,
        data.kind === 'visitor'
          ? { kind: 'visitor', id: data.visitorId, siteId, conversationId }
          : { kind: 'agent', id: data.userId, siteId },
      ));
    } catch (error) {
      return { ok: false, error: this.errorMessage(error, INVALID_ATTACHMENT_MESSAGE) };
    }

    // `appendMessage` only throws when the message itself was not stored (a
    // failed tail update after the insert is logged inside it), so releasing
    // the claim below never frees images a stored message already shows.
    let message: Awaited<ReturnType<ChatService['appendMessage']>>;
    try {
      message = await this.chatService.appendMessage({
        conversationId,
        siteId,
        senderKind: data.kind,
        senderId: data.kind === 'visitor' ? data.visitorId : data.userId,
        senderName: data.kind === 'agent' ? data.name : undefined,
        body,
        attachments,
      });
    } catch (error) {
      await this.attachmentsService
        .release(attachments.map((attachment) => attachment.id), claimedAt)
        .catch(() => undefined);
      this.logger.warn(`message:send failed: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, error: this.errorMessage(error, 'Không gửi được tin nhắn.') };
    }

    const serialized = {
      ...(message.toJSON() as unknown as Record<string, unknown>),
      // Lets the widget show the face and job title of whoever just replied
      // without asking the api who they were.
      sender: data.kind === 'agent' ? data.profile : null,
    };
    this.server.to(conversationRoom(conversationId)).emit('message:new', serialized);

    await this.broadcastConversation(conversationId);

    return { ok: true, message: serialized };
  }

  /**
   * One reaction per person per message. The reactor is always taken from the
   * socket identity, never from the payload, so a visitor cannot react as an
   * agent or as somebody else.
   */
  @SubscribeMessage('message:react')
  async handleMessageReact(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; error?: string; reactions?: Array<Record<string, unknown>> }> {
    const data = socket.data as SocketData | undefined;

    if (!data) {
      return { ok: false, error: 'Not authenticated' };
    }

    // Capped before the lookup: a reaction is a small write anyone can trigger,
    // and the widget is embeddable on any page.
    if (
      !this.rateLimiter.consume(
        `react:${data.kind}:${data.kind === 'visitor' ? data.visitorId : data.userId}`,
        REACT_LIMIT,
        SEND_WINDOW_MS,
      )
    ) {
      return { ok: false, error: 'Bạn thao tác quá nhanh, chờ một chút rồi thử lại.' };
    }

    const messageId = this.readMessageId(payload);

    if (!messageId) {
      return { ok: false, error: 'messageId is required' };
    }

    const emoji = this.readEmoji(payload);

    if (emoji === null) {
      return { ok: false, error: 'Invalid reaction' };
    }

    const message = await this.chatService.findMessageById(messageId);

    if (!message) {
      return { ok: false, error: 'Message not found' };
    }

    const conversationId = String(message.conversationId);

    // System notices ("đã tham gia", reminders) are not something people react to.
    if (message.senderKind === 'system') {
      return { ok: false, error: 'Tin nhắn hệ thống không nhận cảm xúc' };
    }

    // A visitor may only touch its own thread, and only while the project is
    // live — the same gate `message:send` uses.
    if (data.kind === 'visitor') {
      if (conversationId !== data.conversationId || String(message.siteId) !== data.siteId) {
        return { ok: false, error: 'Message not found' };
      }

      const site = await this.sitesService.findById(String(message.siteId));

      if (!site) return { ok: false, error: 'Message not found' };

      if (!site.active) {
        socket.emit('widget:maintenance', { maintenance: true });
        return { ok: false, error: 'Hệ thống chat đang bảo trì. Vui lòng quay lại sau.' };
      }
    }

    if (data.kind === 'agent') {
      const siteId = String(message.siteId);

      if (
        !this.agents.mayRead(socket.id, siteId) ||
        (await this.sitesService.accessFor(siteId, data.userId)) === 'none'
      ) {
        return { ok: false, error: 'Message not found' };
      }
    }

    const updated = await this.chatService.setReaction({
      messageId,
      conversationId,
      kind: data.kind,
      reactorId: data.kind === 'visitor' ? data.visitorId : data.userId,
      emoji,
    });

    if (!updated) {
      return { ok: false, error: 'Message not found' };
    }

    const reactions = serializeReactions(updated.reactions);

    // The visitor and every agent watching this thread are in this room, and
    // they are exactly the people who can see the message being reacted to.
    this.server
      .to(conversationRoom(conversationId))
      .emit('message:reactions', { messageId, conversationId, reactions });

    return { ok: true, reactions };
  }

  /** Agents open a thread to watch it live; this also clears its unread badge. */
  @SubscribeMessage('conversation:join')
  async handleConversationJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; error?: string }> {
    const data = socket.data as SocketData | undefined;

    if (data?.kind !== 'agent') {
      return { ok: false, error: 'Only an agent can join a conversation' };
    }

    const conversationId = this.readConversationId(payload);

    if (!conversationId) {
      return { ok: false, error: 'conversationId is required' };
    }

    const conversation =
      await this.chatService.findConversationById(conversationId);

    if (!conversation) {
      return { ok: false, error: 'Conversation not found' };
    }

    if ((!this.agents.mayRead(socket.id, String(conversation.siteId)) || (await this.sitesService.accessFor(String(conversation.siteId), data.userId)) === 'none')) {
      return { ok: false, error: 'Bạn không có quyền trong dự án này.' };
    }

    if (
      !this.agents.watchConversation(
        socket.id,
        String(conversation.siteId),
        conversationId,
      )
    ) {
      return { ok: false, error: 'Conversation not found' };
    }
    await this.chatService.markReadByAgent(conversationId);

    await this.broadcastConversation(conversationId);

    return { ok: true };
  }

  /**
   * The visitor's widget is open and the document is visible. Only the visitor
   * can say this, and only for the conversation its token was minted for, so
   * the conversation comes from the socket identity and never the payload.
   */
  @SubscribeMessage('visitor:read')
  async handleVisitorRead(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: boolean }> {
    const data = socket.data as SocketData | undefined;

    if (data?.kind !== 'visitor') {
      return { ok: false };
    }

    await this.chatService.markReadByVisitor(data.conversationId);

    return { ok: true };
  }

  @SubscribeMessage('conversation:leave')
  async handleConversationLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean }> {
    const conversationId = this.readConversationId(payload);

    if (
      conversationId &&
      (socket.data as SocketData | undefined)?.kind === 'agent'
    ) {
      this.agents.unwatchConversation(socket.id, conversationId);
    }

    return { ok: true };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const data = socket.data as SocketData | undefined;

    if (!data) {
      return;
    }

    const conversationId =
      data.kind === 'visitor'
        ? data.conversationId
        : this.readConversationId(payload);

    if (!conversationId) {
      return;
    }

    if (data.kind === 'agent') {
      const conversation =
        await this.chatService.findConversationById(conversationId);
      if (
        !conversation ||
        (!this.agents.mayRead(socket.id, String(conversation.siteId)) || (await this.sitesService.accessFor(String(conversation.siteId), data.userId)) === 'none')
      )
        return;
    }
    if (
      !this.rateLimiter.consume(
        'typing:' + (data.kind === 'agent' ? data.userId : data.visitorId),
        20,
        10_000,
      )
    )
      return;

    const isTyping =
      typeof payload === 'object' && payload !== null && 'isTyping' in payload
        ? Boolean((payload as { isTyping: unknown }).isTyping)
        : false;

    socket.to(conversationRoom(conversationId)).emit('typing', {
      conversationId,
      from: data.kind,
      isTyping,
    });
  }

  /**
   * Re-reads the conversation and pushes it to the one project it belongs to.
   * Previously every agent sat in a single room and saw every project's
   * traffic.
   */
  private async broadcastConversation(conversationId: string): Promise<void> {
    const updated = await this.chatService.findConversationById(conversationId);

    if (!updated) {
      return;
    }

    const visitor = await this.chatService.findVisitorById(
      String(updated.visitorId),
    );
    const json = updated.toJSON() as unknown as Record<string, unknown>;

    this.server
      .to(siteRoom(String(updated.siteId)))
      .emit('conversation:updated', {
        ...json,
        visitor: visitor
          ? {
              id: String(visitor._id),
              name: visitor.name ?? null,
              email: visitor.email ?? null,
            }
          : null,
      });
  }

  /**
   * An agent picked Online / Bận / Vắng. The choice belongs to the person, so it
   * is saved on the user and applied to every tab they have open.
   */
  @SubscribeMessage('agent:status')
  async handleAgentStatus(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true; status: AgentStatus } | { ok: false; error: string }> {
    const data = socket.data as SocketData | undefined;

    if (data?.kind !== 'agent') {
      return { ok: false, error: 'Not authenticated' };
    }

    const status =
      typeof payload === 'object' && payload !== null && 'status' in payload
        ? (payload as { status: unknown }).status
        : undefined;

    if (!isAgentStatus(status)) {
      return { ok: false, error: 'Trạng thái không hợp lệ' };
    }

    try {
      const saved = await this.usersService.setAgentStatus(data.userId, status);

      if (!saved) {
        return { ok: false, error: 'Không tìm thấy tài khoản' };
      }

      // Fires onPresenceChanged for each of the person's projects, which
      // re-announces the team status to their open widgets.
      this.agents.setUserStatus(data.userId, saved);
      this.bus.emitToUser(data.userId, 'agent:status:changed', {
        userId: data.userId,
        status: saved,
      });

      return { ok: true, status: saved };
    } catch (error) {
      this.logger.error(
        `agent:status failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, error: 'Không đổi được trạng thái.' };
    }
  }

  /** The best status across every connected agent of a project, all processes included. */
  private async teamStatusForSite(siteId: string): Promise<TeamStatus> {
    if (!this.bridge) {
      return this.agents.teamStatusForSite(siteId);
    }

    return this.bridge
      .teamStatusForSite(siteId)
      .catch(() => this.agents.teamStatusForSite(siteId));
  }

  private async presenceFor(
    siteId: string,
  ): Promise<{ agentsOnline: boolean; teamStatus: TeamStatus }> {
    const teamStatus = await this.teamStatusForSite(siteId);

    return { agentsOnline: teamStatus !== 'offline', teamStatus };
  }

  /** Tells each project's open widgets whether anybody is there to answer, and how. */
  private async announcePresence(siteIds: string[]): Promise<void> {
    await Promise.all(
      siteIds.map(async (siteId) => {
        // Answers can come back out of order; only the newest may be sent.
        const revision = (this.presenceRevisions.get(siteId) ?? 0) + 1;
        this.presenceRevisions.set(siteId, revision);

        try {
          const presence = await this.presenceFor(siteId);

          if (this.presenceRevisions.get(siteId) !== revision) {
            return;
          }

          this.server.to(siteVisitorsRoom(siteId)).emit('presence', presence);
        } catch (error) {
          this.logger.warn(
            `presence for ${siteId} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }

  private consumeSendQuota(data: SocketData): boolean {
    const [key, limit] =
      data.kind === 'visitor'
        ? [`send:visitor:${data.visitorId}`, VISITOR_SEND_LIMIT]
        : [`send:agent:${data.userId}`, AGENT_SEND_LIMIT];

    const allowed = this.rateLimiter.consume(key, limit, SEND_WINDOW_MS);

    if (!allowed) {
      this.logger.warn(`Rate limit hit by ${data.kind} ${key}`);
    }

    return allowed;
  }

  /** '' when absent or blank; an image-only message has no text. */
  private readBody(payload: unknown): string {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('body' in payload)
    ) {
      return '';
    }

    const raw = (payload as { body: unknown }).body;

    if (typeof raw !== 'string') {
      return '';
    }

    return raw.trim().slice(0, MESSAGE_MAX_LENGTH);
  }

  /** [] when absent; null when malformed (not an array of non-empty strings). */
  private readAttachmentIds(payload: unknown): string[] | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('attachmentIds' in payload)
    ) {
      return [];
    }

    const raw = (payload as { attachmentIds: unknown }).attachmentIds;

    if (raw === undefined || raw === null) {
      return [];
    }

    if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !id)) {
      return null;
    }

    return raw as string[];
  }

  /** Client-safe text of a Nest HTTP exception (claim/append errors). */
  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpException && error.getStatus() < 500) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }

  private readConversationId(payload: unknown): string | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('conversationId' in payload)
    ) {
      return null;
    }

    const raw = (payload as { conversationId: unknown }).conversationId;

    return typeof raw === 'string' && raw ? raw : null;
  }

  private readMessageId(payload: unknown): string | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('messageId' in payload)
    ) {
      return null;
    }

    const raw = (payload as { messageId: unknown }).messageId;

    return typeof raw === 'string' && raw ? raw.slice(0, 64) : null;
  }

  /**
   * An empty string means "take my reaction back". Anything that is not a
   * single glyph-like token is rejected rather than truncated: a reaction is
   * never more than one emoji sequence, and whitespace would signal that the
   * caller is using this channel as a text field.
   */
  private readEmoji(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || !('emoji' in payload)) {
      return null;
    }

    const raw = (payload as { emoji: unknown }).emoji;

    if (typeof raw !== 'string') {
      return null;
    }

    const trimmed = raw.trim();

    if (!trimmed) {
      return '';
    }

    if (trimmed.length > REACTION_MAX_LENGTH || /\s/.test(trimmed)) {
      return null;
    }

    // "$body" is a stored field, not an emoji. The write is `$literal`-wrapped,
    // so nothing is evaluated, but keeping such strings out of the data means a
    // reader never has to wonder.
    if (trimmed.startsWith('$')) {
      return null;
    }

    return trimmed;
  }
}
