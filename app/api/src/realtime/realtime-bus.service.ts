import { Injectable } from '@nestjs/common';
import { conversationRoom, siteRoom, userRoom } from './rooms.js';

/** The slice of socket.io's Server used for broadcasting. */
export interface BroadcastTarget {
  to(room: string): { emit(event: string, ...payload: unknown[]): unknown };
}

/**
 * Lets plain HTTP routes push realtime updates. Assigning or closing a
 * conversation happens over REST, but every other agent's inbox has to learn
 * about it immediately, and the gateway cannot be injected into those
 * controllers without a module cycle (sites → chat → widget → realtime).
 *
 * The gateway hands its server in once, on init. Until then, and in unit
 * tests, the emits are no-ops rather than errors.
 */
@Injectable()
export class RealtimeBusService {
  private remote: ((room: string, event: string, payload: unknown) => void) | null = null;

  setRemote(sender: (room: string, event: string, payload: unknown) => void): void { this.remote = sender; }

  deliver(room: string, event: string, payload: unknown): void { this.server?.to(room).emit(event, payload); }

  private server: BroadcastTarget | null = null;

  setServer(server: BroadcastTarget): void {
    this.server = server;
  }

  emitToVisitors(siteId: string, event: string, payload: unknown): void {
    const room = 'site-visitors:' + siteId;
    if (this.remote) this.remote(room, event, payload); else this.deliver(room, event, payload);
  }

  emitToSite(siteId: string, event: string, payload: unknown): void {
    if (this.remote) this.remote(siteRoom(siteId), event, payload);
    else this.deliver(siteRoom(siteId), event, payload);
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    if (this.remote) this.remote(conversationRoom(conversationId), event, payload);
    else this.deliver(conversationRoom(conversationId), event, payload);
  }

  /**
   * One person's own sockets. Used for events that are addressed to somebody
   * rather than to a project or a thread — the notification bell above all.
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    const room = userRoom(userId);
    if (this.remote) this.remote(room, event, payload);
    else this.deliver(room, event, payload);
  }
}
