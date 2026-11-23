import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { AgentRegistryService } from './agent-registry.service.js';
import { VisitorRegistryService } from './visitor-registry.service.js';
import { RealtimeBusService } from './realtime-bus.service.js';
import {
  bestTeamStatus,
  isAgentStatus,
  type AgentStatus,
  type TeamStatus,
} from '../users/agent-status.js';

/**
 * What one process publishes about itself: until when this row is fresh, the
 * projects with staff online, the staff themselves, the conversations with a
 * visitor socket open and, per project, the best status of its connected staff.
 * A heartbeat written before the last field existed has no map; its projects
 * then count as `online`, which is how they behaved before statuses.
 */
interface PresenceHeartbeat {
  until: number;
  sites: string[];
  users: string[];
  visitorConversations: string[];
  siteTeamStatus?: Record<string, AgentStatus>;
}

/** Private Redis bus: do not expose Redis on a public network. */
@Injectable()
export class RedisBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisBridgeService.name);
  private readonly id = randomUUID();
  private publisher: ReturnType<typeof createClient> | null = null;
  private subscriber: ReturnType<typeof createClient> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingWrite: ReturnType<typeof setTimeout> | null = null;
  private detachRegistries: Array<() => void> = [];
  private channel = '';
  private presenceKey = '';
  constructor(private readonly config: ConfigService, private readonly registry: AgentRegistryService, private readonly visitors: VisitorRegistryService, private readonly bus: RealtimeBusService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      if (this.config.get<string>('SERVICE_ROLE') === 'realtime') throw new Error('REDIS_URL is required');
      return;
    }
    const prefix = this.config.get<string>('REALTIME_CHANNEL') || 'chat-center:realtime:v1';
    this.channel = prefix;
    this.presenceKey = prefix + ':presence';
    this.publisher = createClient({ url, socket: { connectTimeout: 5000 } });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', () => this.logger.error('Redis publisher unavailable'));
    this.subscriber.on('error', () => this.logger.error('Redis subscriber unavailable'));
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(this.channel, (raw) => {
      try {
        const message = JSON.parse(raw);
        if (message.source === this.id) return;
        if (message.type === 'access' && ['grant', 'revoke'].includes(message.action) && typeof message.userId === 'string' && typeof message.siteId === 'string') {
          this.registry.applyRemote(message.action, message.userId, message.siteId);
        } else if (message.type === 'broadcast' && typeof message.room === 'string' && typeof message.event === 'string') {
          this.bus.deliver(message.room, message.event, message.payload);
        }
      } catch { this.logger.warn('Ignored malformed realtime event'); }
    });
    this.bus.setRemote((room, event, payload) => {
      this.bus.deliver(room, event, payload);
      this.publish({ type: 'broadcast', room, event, payload });
    });
    this.registry.onAccessChanged((action, userId, siteId) => this.publish({ type: 'access', action, userId, siteId }));
    if (this.config.get<string>('SERVICE_ROLE') === 'realtime') {
      // A connect or disconnect must reach other instances now, not up to three
      // seconds later: a push decision made in between would be wrong.
      const schedule = () => this.schedulePresenceWrite();
      this.detachRegistries = [
        this.registry.onConnectionsChanged(schedule),
        this.visitors.onConnectionsChanged(schedule),
      ];
      await this.writePresence();
      this.timer = setInterval(() => { void this.writePresence().catch(() => this.logger.error('Presence heartbeat failed')); }, 3000);
      this.timer.unref();
    }
  }
  private publish(message: Record<string, unknown>) {
    if (!this.publisher?.isReady) { this.logger.error('Realtime event not delivered: Redis offline'); return; }
    void this.publisher.publish(this.channel, JSON.stringify({ ...message, source: this.id })).catch(() => this.logger.error('Realtime publish failed'));
  }
  /**
   * Coalesces the burst of changes one connect produces (register, joins, the
   * access events) into a single heartbeat write.
   */
  private schedulePresenceWrite(): void {
    if (this.pendingWrite) return;
    this.pendingWrite = setTimeout(() => {
      this.pendingWrite = null;
      void this.writePresence().catch(() => this.logger.error('Presence heartbeat failed'));
    }, 50);
    this.pendingWrite.unref();
  }
  private async writePresence() {
    if (!this.publisher?.isReady) return;
    const heartbeat: PresenceHeartbeat = {
      until: Date.now() + 10000,
      sites: this.registry.allSiteIds(),
      users: this.registry.connectedUserIds(),
      visitorConversations: this.visitors.connectedConversationIds(),
      siteTeamStatus: this.registry.siteTeamStatuses(),
    };
    await this.publisher.hSet(this.presenceKey, this.id, JSON.stringify(heartbeat));
  }
  async isAnyoneOnline(siteId: string): Promise<boolean> {
    if (this.registry.isAnyoneOnlineForSite(siteId)) return true;
    if (!this.publisher?.isReady) return false;
    try {
      const entries = await this.publisher.hGetAll(this.presenceKey);
      for (const [id, raw] of Object.entries(entries)) {
        const value = JSON.parse(raw);
        if (value.until < Date.now()) { await this.publisher.hDel(this.presenceKey, id); continue; }
        if (Array.isArray(value.sites) && value.sites.includes(siteId)) return true;
      }
    } catch { return false; }
    return false;
  }

  /**
   * How connected staff looks to a visitor of that project, across processes.
   *
   * The local registry answers for this process's sockets and is never worse
   * than what Redis says; the shared heartbeat adds the peers. A peer that
   * published before this field existed lists the project in `sites` but has no
   * status for it, and that counts as `online` — the old behaviour.
   */
  async teamStatusForSite(siteId: string): Promise<TeamStatus> {
    if (!this.publisher?.isReady) return this.registry.teamStatusForSite(siteId);

    try {
      const entries = await this.publisher.hGetAll(this.presenceKey);
      // Read after the await: a status change made while Redis answered must
      // not be overwritten by the snapshot from before it.
      const statuses: TeamStatus[] = [this.registry.teamStatusForSite(siteId)];

      for (const [id, raw] of Object.entries(entries)) {
        // This process already answered for itself above.
        if (id === this.id) continue;

        const heartbeat = JSON.parse(raw) as PresenceHeartbeat;
        if (!heartbeat || typeof heartbeat.until !== 'number' || heartbeat.until < Date.now()) {
          await this.publisher.hDel(this.presenceKey, id);
          continue;
        }

        const fromMap = heartbeat.siteTeamStatus?.[siteId];
        if (isAgentStatus(fromMap)) {
          statuses.push(fromMap);
        } else if (
          !heartbeat.siteTeamStatus &&
          Array.isArray(heartbeat.sites) &&
          heartbeat.sites.includes(siteId)
        ) {
          statuses.push('online');
        }
      }

      return bestTeamStatus(statuses);
    } catch {
      // A Redis hiccup must not hide this process's own staff.
      return this.registry.teamStatusForSite(siteId);
    }
  }

  /**
   * Whether one person has a socket open anywhere.
   *
   * `null` means "cannot tell": Redis is not configured or not connected, or no
   * process published a fresh heartbeat. Callers that must not guess (push,
   * email) defer rather than assume somebody is offline.
   */
  async isUserConnected(userId: string): Promise<boolean | null> {
    if (this.registry.isUserConnected(userId)) return true;

    return this.anyHeartbeatHas('users', userId);
  }

  /** The same question for a conversation's visitor sockets. */
  async isVisitorConnected(conversationId: string): Promise<boolean | null> {
    if (this.visitors.isConnected(conversationId)) return true;

    return this.anyHeartbeatHas('visitorConversations', conversationId);
  }

  /**
   * Scans the shared heartbeat for one value.
   *
   * Three outcomes:
   * - `true` — some fresh process lists the id.
   * - `false` — every fresh heartbeat carries this dimension *and* none lists
   *   the id, i.e. all live processes agree it is absent.
   * - `null` — cannot tell: no Redis, or any fresh heartbeat predates this
   *   field. An older peer's heartbeat (`users` / `visitorConversations`
   *   missing) is silence about that dimension, not evidence of absence, so it
   *   makes the answer unknown instead of offline.
   */
  private async anyHeartbeatHas(
    field: 'users' | 'visitorConversations',
    value: string,
  ): Promise<boolean | null> {
    if (!this.publisher?.isReady) return null;

    try {
      const entries = await this.publisher.hGetAll(this.presenceKey);
      let fresh = 0;
      let unknown = 0;

      for (const [id, raw] of Object.entries(entries)) {
        const heartbeat = JSON.parse(raw) as PresenceHeartbeat;
        if (!heartbeat || typeof heartbeat.until !== 'number' || heartbeat.until < Date.now()) {
          await this.publisher.hDel(this.presenceKey, id);
          continue;
        }
        fresh += 1;
        const listed = heartbeat[field];
        if (Array.isArray(listed)) {
          if (listed.includes(value)) return true;
        } else {
          // Published before this dimension existed: that process could hold
          // the socket and we cannot rule it out.
          unknown += 1;
        }
      }

      if (fresh === 0) return null;
      return unknown > 0 ? null : false;
    } catch {
      // A Redis hiccup must not read as "offline".
      return null;
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.pendingWrite) clearTimeout(this.pendingWrite);
    for (const detach of this.detachRegistries) detach();
    this.detachRegistries = [];
    if (this.publisher?.isReady && this.presenceKey) await this.publisher.hDel(this.presenceKey, this.id);
    this.subscriber?.destroy(); this.publisher?.destroy();
  }
}
