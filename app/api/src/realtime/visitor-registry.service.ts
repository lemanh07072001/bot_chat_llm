import { Injectable } from '@nestjs/common';

/**
 * Which conversations currently have a visitor socket open.
 *
 * AgentRegistryService answers the same question for staff, but a visitor is
 * identified by the conversation its token was minted for and one person may
 * hold several sockets (two tabs of the same site). Presence is therefore
 * counted per socket and collapsed per conversation on read.
 *
 * Like the agent registry it is per-process; the Redis heartbeat carries the
 * union to every other instance.
 */
@Injectable()
export class VisitorRegistryService {
  private readonly socketIdsByConversation = new Map<string, Set<string>>();
  private readonly conversationIdBySocket = new Map<string, string>();
  private readonly connectionsChanged = new Set<() => void>();

  onConnectionsChanged(listener: () => void): () => void {
    this.connectionsChanged.add(listener);
    return () => this.connectionsChanged.delete(listener);
  }

  register(socketId: string, conversationId: string): void {
    // A socket that somehow re-registers must not be counted twice.
    if (this.conversationIdBySocket.get(socketId) === conversationId) {
      return;
    }

    this.unregister(socketId);

    this.conversationIdBySocket.set(socketId, conversationId);

    const owned = this.socketIdsByConversation.get(conversationId) ?? new Set<string>();
    owned.add(socketId);
    this.socketIdsByConversation.set(conversationId, owned);

    this.notifyConnectionsChanged();
  }

  unregister(socketId: string): void {
    const conversationId = this.conversationIdBySocket.get(socketId);

    if (!conversationId) {
      return;
    }

    this.conversationIdBySocket.delete(socketId);

    const owned = this.socketIdsByConversation.get(conversationId);
    owned?.delete(socketId);

    if (owned && owned.size === 0) {
      this.socketIdsByConversation.delete(conversationId);
    }

    this.notifyConnectionsChanged();
  }

  /** True while at least one socket of this conversation's visitor is open. */
  isConnected(conversationId: string): boolean {
    return (this.socketIdsByConversation.get(conversationId)?.size ?? 0) > 0;
  }

  connectedConversationIds(): string[] {
    return [...this.socketIdsByConversation.keys()];
  }

  private notifyConnectionsChanged(): void {
    for (const listener of this.connectionsChanged) listener();
  }
}
