import { Injectable } from '@nestjs/common';
import { conversationRoom, siteRoom } from './rooms.js';
import {
  bestTeamStatus,
  normalizeAgentStatus,
  type AgentStatus,
  type TeamStatus,
} from '../users/agent-status.js';

/**
 * The slice of a socket this registry needs. Narrow on purpose: it keeps the
 * registry free of socket.io and testable with a plain object.
 */
export interface AgentConnection {
  id: string;
  join(room: string): unknown;
  leave(room: string): unknown;
  emit(event: string, payload: unknown): unknown;
}

interface AgentSession {
  userId: string;
  siteIds: Set<string>;
  connection: AgentConnection;
  conversations: Map<string, string>;
  /** Told by the agent (all their tabs share one); defaults to online. */
  status: AgentStatus;
}

/**
 * Who is connected, and which projects each of them is currently subscribed
 * to. It exists outside the gateway so that code which changes project
 * membership can take effect on live sockets — otherwise a person removed from
 * a project would keep receiving its updates until they happened to reconnect.
 *
 * It is per-process. With more than one api instance, each holds its own view,
 * so presence counts are per-instance and revocation only reaches sockets on
 * the same instance; that is the same constraint as the socket.io rooms
 * themselves and is lifted by the Redis adapter (see DEPLOY.md).
 */
@Injectable()
export class AgentRegistryService {
  private accessChanged: ((action: 'grant' | 'revoke', userId: string, siteId: string) => void) | null = null;
  onAccessChanged(listener: (action: 'grant' | 'revoke', userId: string, siteId: string) => void): void { this.accessChanged = listener; }
  applyRemote(action: 'grant' | 'revoke', userId: string, siteId: string): void {
    const listener = this.accessChanged;
    this.accessChanged = null;
    try { if (action === 'grant') this.grantSite(userId, siteId); else this.revokeSite(userId, siteId); }
    finally { this.accessChanged = listener; }
  }
  allSiteIds(): string[] { return [...new Set([...this.sessions.values()].flatMap((session) => [...session.siteIds]))]; }

  private presenceChanged: (siteId: string) => void = () => {};

  onPresenceChanged(listener: (siteId: string) => void): void {
    this.presenceChanged = listener;
  }

  /**
   * Fired whenever the set of connected people or their project access changes,
   * so the Redis heartbeat can be rewritten straight away instead of waiting for
   * its next tick. Only the process that owns the sockets (realtime) publishes.
   */
  private readonly connectionsChanged = new Set<() => void>();

  onConnectionsChanged(listener: () => void): () => void {
    this.connectionsChanged.add(listener);
    return () => this.connectionsChanged.delete(listener);
  }

  private notifyConnectionsChanged(): void {
    for (const listener of this.connectionsChanged) listener();
  }

  private readonly sessions = new Map<string, AgentSession>();
  private readonly socketIdsByUser = new Map<string, Set<string>>();

  register(
    userId: string,
    siteIds: string[],
    connection: AgentConnection,
    status?: AgentStatus,
  ): void {
    this.sessions.set(connection.id, {
      userId,
      siteIds: new Set(siteIds),
      connection,
      conversations: new Map(),
      status: normalizeAgentStatus(status),
    });

    const owned = this.socketIdsByUser.get(userId) ?? new Set<string>();
    owned.add(connection.id);
    this.socketIdsByUser.set(userId, owned);

    this.notifyConnectionsChanged();
  }

  unregister(socketId: string): void {
    const session = this.sessions.get(socketId);

    if (!session) {
      return;
    }

    this.sessions.delete(socketId);

    const owned = this.socketIdsByUser.get(session.userId);
    owned?.delete(socketId);

    if (owned && owned.size === 0) {
      this.socketIdsByUser.delete(session.userId);
    }

    this.notifyConnectionsChanged();
  }

  /** True when the socket may currently read that project. */
  mayRead(socketId: string, siteId: string): boolean {
    return this.sessions.get(socketId)?.siteIds.has(siteId) ?? false;
  }

  watchConversation(
    socketId: string,
    siteId: string,
    conversationId: string,
  ): boolean {
    const session = this.sessions.get(socketId);
    if (!session?.siteIds.has(siteId)) return false;
    session.conversations.set(conversationId, siteId);
    session.connection.join(conversationRoom(conversationId));
    return true;
  }

  unwatchConversation(socketId: string, conversationId: string): void {
    const session = this.sessions.get(socketId);
    session?.conversations.delete(conversationId);
    session?.connection.leave(conversationRoom(conversationId));
  }

  siteIdsForSocket(socketId: string): string[] {
    return [...(this.sessions.get(socketId)?.siteIds ?? [])];
  }

  /** Takes effect immediately on open sockets, not on the next reconnect. */
  grantSite(userId: string, siteId: string): void {
    this.accessChanged?.('grant', userId, siteId);
    for (const session of this.sessionsOf(userId)) {
      session.siteIds.add(siteId);
      session.connection.join(siteRoom(siteId));
      session.connection.emit('access:granted', { siteId });
    }
    this.presenceChanged(siteId);
  }

  revokeSite(userId: string, siteId: string): void {
    this.accessChanged?.('revoke', userId, siteId);
    for (const session of this.sessionsOf(userId)) {
      session.siteIds.delete(siteId);
      session.connection.leave(siteRoom(siteId));
      for (const [conversationId, projectId] of session.conversations) {
        if (projectId === siteId)
          this.unwatchConversation(session.connection.id, conversationId);
      }
      // Lets the inbox drop the project from its list without a full reload.
      session.connection.emit('access:revoked', { siteId });
    }
    this.presenceChanged(siteId);
  }

  /** Drives the widget's "someone is here" state. */
  isAnyoneOnlineForSite(siteId: string): boolean {
    for (const session of this.sessions.values()) {
      if (session.siteIds.has(siteId)) {
        return true;
      }
    }

    return false;
  }

  onlineUserIdsForSite(siteId: string): string[] {
    const userIds = new Set<string>();

    for (const session of this.sessions.values()) {
      if (session.siteIds.has(siteId)) {
        userIds.add(session.userId);
      }
    }

    return [...userIds];
  }

  /**
   * Whether this person has any socket open right now. Used to decide whether a
   * push is worth sending: a browser tab that is already listening gets the
   * bell event over the socket instead.
   */
  isUserConnected(userId: string): boolean {
    return (this.socketIdsByUser.get(userId)?.size ?? 0) > 0;
  }

  /** Every person with at least one socket open, for the heartbeat payload. */
  connectedUserIds(): string[] {
    return [...this.socketIdsByUser.keys()];
  }

  /**
   * Applies a person's availability to every tab they have open — status is
   * per person, not per socket — and returns the projects those tabs cover so
   * the caller knows which widgets to re-announce.
   */
  setUserStatus(userId: string, status: AgentStatus): string[] {
    const normalized = normalizeAgentStatus(status);
    const siteIds = new Set<string>();

    for (const session of this.sessionsOf(userId)) {
      session.status = normalized;
      for (const siteId of session.siteIds) siteIds.add(siteId);
    }

    this.notifyConnectionsChanged();
    for (const siteId of siteIds) this.presenceChanged(siteId);

    return [...siteIds];
  }

  /** The availability this person has set; null when no socket is open. */
  statusForUser(userId: string): AgentStatus | null {
    for (const session of this.sessionsOf(userId)) {
      return session.status;
    }

    return null;
  }

  /** How connected staff looks to a visitor of that project. */
  teamStatusForSite(siteId: string): TeamStatus {
    return bestTeamStatus(
      [...this.sessions.values()]
        .filter((session) => session.siteIds.has(siteId))
        .map((session) => session.status),
    );
  }

  /** Best status per project, for the heartbeat other processes read. */
  siteTeamStatuses(): Record<string, AgentStatus> {
    const bySite = new Map<string, AgentStatus[]>();

    for (const session of this.sessions.values()) {
      for (const siteId of session.siteIds) {
        const statuses = bySite.get(siteId) ?? [];
        statuses.push(session.status);
        bySite.set(siteId, statuses);
      }
    }

    const result: Record<string, AgentStatus> = {};

    for (const [siteId, statuses] of bySite) {
      const best = bestTeamStatus(statuses);
      // At least one connected session, so this can never be `offline`.
      if (best !== 'offline') result[siteId] = best;
    }

    return result;
  }

  private *sessionsOf(userId: string): Generator<AgentSession> {
    for (const socketId of this.socketIdsByUser.get(userId) ?? []) {
      const session = this.sessions.get(socketId);

      if (session) {
        yield session;
      }
    }
  }
}
