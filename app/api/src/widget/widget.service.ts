import { Optional } from '@nestjs/common';
import { RedisBridgeService } from '../realtime/redis-bridge.service.js';
import {
  ForbiddenException,
  ServiceUnavailableException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { SitesService } from '../sites/sites.service.js';
import { ChatService } from '../chat/chat.service.js';
import type { VisitorJwtPayload } from '../auth/jwt-payload.type.js';
import { AgentRegistryService } from '../realtime/agent-registry.service.js';
import type { WidgetSettings } from '../sites/site.schema.js';
import { UsersService } from '../users/users.service.js';
import { agentProfileOf, type AgentProfile } from '../users/user.schema.js';

/**
 * What the widget tells the visitor to expect. Nothing here blocks sending a
 * message — it only sets the expectation, so an out-of-hours message does not
 * look ignored.
 */
export interface WidgetAvailability {
  maintenance?: boolean;
  /** At least one member of the project has the inbox open. */
  agentsOnline: boolean;
  /** False only when the project declared hours and now is outside them. */
  withinOfficeHours: boolean;
  /** Shown when outside office hours. */
  offlineMessage: string;
}

export interface WidgetSessionResult {
  visitorToken: string;
  realtimeUrl: string;
  visitorKey: string;
  /** This visitor's own id; the widget needs it to mark its own reactions. */
  visitorId: string;
  conversationId: string;
  settings: WidgetSettings;
  availability: WidgetAvailability;
  /** Whatever the visitor has already told us, so the form is not asked twice. */
  contact: { name: string | null; email: string | null };
  messages: unknown[];
  /**
   * The staff who appear in the messages sent here, so each reply can be shown
   * with a face and a job title rather than a bare name.
   */
  agents: AgentProfile[];
  /** Who is handling the thread right now, shown in the widget header. */
  assignedAgent: AgentProfile | null;
  /** True when the thread has older messages than the ones sent here. */
  hasMoreMessages: boolean;
  nextMessageCursor: string | null;
}

@Injectable()
export class WidgetService {
  constructor(
    private readonly sitesService: SitesService,
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly agents: AgentRegistryService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    @Optional() private readonly bridge?: RedisBridgeService,
  ) {}

  /**
   * Public profiles for a set of staff ids, in one query.
   *
   * Ids that no longer resolve are simply absent: a deleted account leaves its
   * messages behind, and those keep the name stored on the message itself.
   */
  async agentProfiles(ids: (string | null | undefined)[]): Promise<AgentProfile[]> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];

    if (unique.length === 0) {
      return [];
    }

    return (await this.users.findManyByIds(unique)).map((user) => agentProfileOf(user));
  }

  /**
   * Bootstraps an anonymous visitor from nothing but the site public key. The
   * key is public, so the Origin header is what actually gates this.
   */
  async createSession(input: {
    publicKey: string;
    visitorKey?: string;
    origin?: string;
    userAgent?: string;
  }): Promise<WidgetSessionResult> {
    const site = await this.sitesService.findByPublicKey(input.publicKey);

    // Same response for unknown and deactivated keys: probing a key should not
    // reveal whether it exists.
    if (!site) {
      throw new UnauthorizedException('Unknown site key');
    }

    if (!this.sitesService.isOriginAllowed(site, input.origin)) {
      throw new ForbiddenException(
        'This origin is not allowed to embed this site',
      );
    }

    if (!site.active) throw new ServiceUnavailableException({ code: 'WIDGET_MAINTENANCE', message: 'Hệ thống chat đang bảo trì. Vui lòng quay lại sau.' });
    const siteId = String(site._id);
    const visitor = await this.chatService.resolveVisitor(
      siteId,
      input.visitorKey,
      input.userAgent,
    );
    const conversation = await this.chatService.resolveOpenConversation(
      siteId,
      String(visitor._id),
    );
    const conversationId = String(conversation._id);
    const history = await this.chatService.listMessages(conversationId);
    const assignedAgentId = conversation.assignedAgentId
      ? String(conversation.assignedAgentId)
      : null;
    const profiles = await this.agentProfiles([
      assignedAgentId,
      ...history.messages.map((message) =>
        message.senderKind === 'agent' && message.senderId
          ? String(message.senderId)
          : null,
      ),
    ]);

    return {
      visitorToken: this.signVisitorToken({
        scope: 'visitor',
        sub: String(visitor._id),
        siteId,
        conversationId,
      }),
      realtimeUrl: this.config.get<string>('PUBLIC_REALTIME_URL') || 'http://localhost:3003',
      visitorKey: visitor.visitorKey,
      visitorId: String(visitor._id),
      conversationId,
      settings: site.settings,
      availability: {
        agentsOnline: this.bridge ? await this.bridge.isAnyoneOnline(siteId) : this.agents.isAnyoneOnlineForSite(siteId),
        withinOfficeHours: this.sitesService.isWithinOfficeHours(site),
        offlineMessage: site.officeHours?.offlineMessage ?? '',
      },
      contact: { name: visitor.name ?? null, email: visitor.email ?? null },
      messages: history.messages.map((message) => message.toJSON()),
      agents: profiles,
      assignedAgent: profiles.find((agent) => agent.id === assignedAgentId) ?? null,
      hasMoreMessages: history.hasMore,
      nextMessageCursor: history.nextCursor,
    };
  }

  async availabilityForSite(siteId: string): Promise<WidgetAvailability> {
    const site = await this.sitesService.findById(siteId);
    if (!site) throw new UnauthorizedException('Unknown site');
    return {
      agentsOnline: this.bridge ? await this.bridge.isAnyoneOnline(siteId) : this.agents.isAnyoneOnlineForSite(siteId),
      withinOfficeHours: this.sitesService.isWithinOfficeHours(site),
      offlineMessage: site.officeHours?.offlineMessage ?? '',
    };
  }

  signVisitorToken(payload: VisitorJwtPayload): string {
    return this.jwtService.sign(payload, {
      expiresIn: (this.config.get<string>('VISITOR_JWT_EXPIRES_IN') ??
        '7d') as StringValue,
    });
  }

  /** Used by both the HTTP visitor guard and the websocket handshake. */
  async verifyVisitorToken(
    token: string | undefined,
  ): Promise<VisitorJwtPayload> {
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: VisitorJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<VisitorJwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    if (
      payload.scope !== 'visitor' ||
      !payload.conversationId ||
      !payload.siteId
    ) {
      throw new UnauthorizedException();
    }

    if (!(await this.sitesService.findById(payload.siteId))) throw new UnauthorizedException();
    return payload;
  }
}
