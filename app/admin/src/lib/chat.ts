/**
 * Pure types and helpers, safe to import from Client Components. Server-side
 * fetchers live in `chat-api.ts`, which pulls in next/headers and therefore
 * must never be imported from client code.
 */

import type { AttachmentView } from "@/lib/attachments";

export type ConversationStatus = "open" | "closed";

export type ConversationVisitor = {
  id: string;
  name: string | null;
  email: string | null;
};

export type Conversation = {
  id: string;
  siteId: string;
  visitorId: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  lastMessageAt: string;
  lastMessagePreview?: string;
  unreadForAgent: number;
  createdAt: string;
  updatedAt: string;
  /** Added by the api when listing; absent on realtime updates. */
  siteName?: string | null;
  assignedAgentName?: string | null;
  visitor?: ConversationVisitor | null;
};

/** Which slice of the inbox the agent is looking at. */
export type InboxFilter = "all" | "mine" | "unassigned" | "closed";

export type ConversationCounts = {
  open: number;
  mine: number;
  unassigned: number;
  closed: number;
};

/** Just enough about a project to label a conversation and gate its actions. */
export type ProjectRef = {
  id: string;
  name: string;
  access: "owner" | "manager";
};

export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "mine", label: "Của tôi" },
  { key: "unassigned", label: "Chờ phân công" },
  { key: "closed", label: "Đã đóng" },
];

export function isInboxFilter(value: unknown): value is InboxFilter {
  return value === "all" || value === "mine" || value === "unassigned" || value === "closed";
}

/**
 * The api takes `status` and `assignment` separately; the inbox shows them as
 * one row of tabs.
 */
export function filterToQuery(filter: InboxFilter): Record<string, string> {
  switch (filter) {
    case "mine":
      return { assignment: "mine" };
    case "unassigned":
      return { status: "open", assignment: "unassigned" };
    case "closed":
      return { status: "closed" };
    default:
      return {};
  }
}

/**
 * Whether a conversation still belongs in the list the agent is looking at.
 * Realtime updates arrive for the whole project, so a thread somebody else
 * just claimed has to drop out of "chờ phân công" on its own.
 */
export function matchesFilter(
  conversation: Conversation,
  filter: InboxFilter,
  currentUserId: string,
): boolean {
  switch (filter) {
    case "mine":
      return conversation.assignedAgentId === currentUserId;
    case "unassigned":
      return conversation.status === "open" && !conversation.assignedAgentId;
    case "closed":
      return conversation.status === "closed";
    default:
      return true;
  }
}

export type MessageSenderKind = "visitor" | "agent" | "system";

export type MessageReaction = {
  emoji: string;
  /** Who left it, so the same payload serves every viewer. */
  kind: "visitor" | "agent";
  /** Visitor or user id. */
  id: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderKind: MessageSenderKind;
  senderId: string | null;
  senderName?: string;
  sender?: { id: string; name: string; avatarUrl: string | null; jobTitle: string | null } | null;
  /** May be '' when the message only carries images. */
  body: string;
  attachments?: AttachmentView[];
  reactions?: MessageReaction[];
  createdAt: string;
};

/**
 * Collapses the stored list into one badge per emoji, in first-seen order, and
 * reports which emoji the viewer picked so the badge can be highlighted.
 * `nameOf` labels everyone else's reactions, for the badge tooltip.
 */
export function summarizeReactions(
  reactions: MessageReaction[] | undefined,
  viewerId: string | null,
  nameOf?: (reaction: MessageReaction) => string,
): {
  badges: Array<{ emoji: string; count: number; mine: boolean; others: string[] }>;
  mine: string | null;
} {
  const byEmoji = new Map<
    string,
    { emoji: string; count: number; mine: boolean; others: string[] }
  >();
  let mine: string | null = null;

  for (const reaction of reactions ?? []) {
    const entry = byEmoji.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      mine: false,
      others: [],
    };
    entry.count += 1;

    if (viewerId && reaction.kind === "agent" && reaction.id === viewerId) {
      entry.mine = true;
      mine = reaction.emoji;
    } else if (nameOf) {
      const name = nameOf(reaction);
      if (!entry.others.includes(name)) entry.others.push(name);
    }

    byEmoji.set(reaction.emoji, entry);
  }

  return { badges: [...byEmoji.values()], mine };
}

/** "A", "A và B", "A, B và C" — for "who reacted" tooltips. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}`;
}

/** Best label we have for an anonymous visitor. */
export function visitorLabel(conversation: Conversation): string {
  const visitor = conversation.visitor;

  if (visitor?.name) return visitor.name;
  if (visitor?.email) return visitor.email;

  return `Khách #${conversation.visitorId.slice(-6)}`;
}
