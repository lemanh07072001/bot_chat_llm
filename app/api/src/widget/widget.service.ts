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
import {
  DEFAULT_AWAY_MESSAGE,
  DEFAULT_BUSY_MESSAGE,
  type TeamStatus,
} from '../users/agent-status.js';
import type { VisitorDocument } from '../chat/visitor.schema.js';
import type { SiteDocument } from '../sites/site.schema.js';

/**
 * What the widget tells the visitor to expect. Nothing here blocks sending a
 * message — it only sets the expectation, so an out-of-hours message does not
 * look ignored.
 */
export interface WidgetAvailability {
  maintenance?: boolean;
  /** At least one member of the project has the inbox open. */
  agentsOnline: boolean;
  /** The best status among connected agents; `offline` when none is connected. */
  teamStatus: TeamStatus;
  /** False only when the project declared hours and now is outside them. */
  withinOfficeHours: boolean;
  /** Shown when outside office hours. */
  offlineMessage: string;
  /** Shown while the team is busy, unless the project wrote its own. */
  busyMessage: string;
  /** Shown while the team is away, unless the project wrote its own. */
  awayMessage: string;
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
    resumeOnly?: boolean;
    origin?: string;
    userAgent?: string;
  }): Promise<WidgetSessionResult | { resumed: false }> {
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

    // "Reattach to my old chat, or tell me there is none." Answered before any
    // write: an unknown or missing key creates no visitor and no conversation,
    // so a widget polling this endpoint cannot mint rows.
    if (input.resumeOnly) {
      const existing = input.visitorKey
        ? await this.chatService.findVisitorByKey(siteId, input.visitorKey)
        : null;

      if (!existing) {
        return { resumed: false };
      }

      return this.buildSession(site, existing);
    }

    const visitor = await this.chatService.resolveVisitor(
      siteId,
      input.visitorKey,
      input.userAgent,
    );

    return this.buildSession(site, visitor);
  }

  /** Everything a widget needs once the visitor row is known. */
  private async buildSession(
    site: SiteDocument,
    visitor: VisitorDocument,
  ): Promise<WidgetSessionResult> {
    const siteId = String(site._id);

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
      // Projects saved before these fields existed keep their old documents;
      // the defaults are filled in so the widget always has a message.
      settings: this.withMessageDefaults(site.settings),
      availability: await this.buildAvailability(site),
      contact: { name: visitor.name ?? null, email: visitor.email ?? null },
      messages: history.messages.map((message) => message.toJSON()),
      agents: profiles,
      assignedAgent: profiles.find((agent) => agent.id === assignedAgentId) ?? null,
      hasMoreMessages: history.hasMore,
      nextMessageCursor: history.nextCursor,
    };
  }

  /**
   * The stored widget settings plus the message defaults, as a plain object.
   *
   * A project saved before these messages existed has neither key, and the
   * widget must still be able to show something.
   */
  private withMessageDefaults(settings?: WidgetSettings): WidgetSettings {
    // A hydrated subdocument only serialises through toObject(); a plain
    // object (a lean read, a test fixture) is already what we want.
    const source = settings as (Partial<WidgetSettings> & { toObject?: () => Partial<WidgetSettings> }) | undefined;
    const stored: Partial<WidgetSettings> =
      typeof source?.toObject === 'function' ? source.toObject() : source ?? {};

    return {
      ...stored,
      busyMessage: stored.busyMessage || DEFAULT_BUSY_MESSAGE,
      awayMessage: stored.awayMessage || DEFAULT_AWAY_MESSAGE,
    } as WidgetSettings;
  }

  async availabilityForSite(siteId: string): Promise<WidgetAvailability> {
    const site = await this.sitesService.findById(siteId);
    if (!site) throw new UnauthorizedException('Unknown site');
    return this.buildAvailability(site);
  }

  /**
   * The one place that answers "what should this visitor expect right now".
   *
   * Both the session bootstrap and the polling endpoint go through here, so a
   * visitor cannot see two different answers depending on which one they hit.
   * `agentsOnline` keeps its old meaning — somebody is connected — while
   * `teamStatus` says what that somebody set themselves to.
   */
  private async buildAvailability(site: SiteDocument): Promise<WidgetAvailability> {
    const siteId = String(site._id);
    const teamStatus = this.bridge
      ? await this.bridge.teamStatusForSite(siteId)
      : this.agents.teamStatusForSite(siteId);

    return {
      agentsOnline: teamStatus !== 'offline',
      teamStatus,
      withinOfficeHours: this.sitesService.isWithinOfficeHours(site),
      offlineMessage: site.officeHours?.offlineMessage ?? '',
      busyMessage: site.settings?.busyMessage || DEFAULT_BUSY_MESSAGE,
      awayMessage: site.settings?.awayMessage || DEFAULT_AWAY_MESSAGE,
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
