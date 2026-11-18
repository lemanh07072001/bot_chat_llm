/**
 * Pure types and helpers, safe to import from Client Components. Server-side
 * fetchers live in `chat-api.ts`, which pulls in next/headers and therefore
 * must never be imported from client code.
 */

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
  /** False when the project turned machine translation off for its threads. */
  translation?: boolean;
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

/** One stored rendering of a message in another language. */
export type MessageTranslation = {
  lang: string;
  text: string;
  model?: string;
  at?: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderKind: MessageSenderKind;
  senderId: string | null;
  senderName?: string;
  sender?: { id: string; name: string; avatarUrl: string | null; jobTitle: string | null } | null;
  body: string;
  createdAt: string;
  /**
   * Translations already paid for, one per language. They live on the message
   * rather than in the panel so a reload does not translate the same line twice.
   */
  translations?: MessageTranslation[];
};

/** The stored translation for a language, if somebody already asked for it. */
export function translationFor(
  message: ChatMessage,
  language: string,
): MessageTranslation | undefined {
  return message.translations?.find((translation) => translation.lang === language);
}

/** Best label we have for an anonymous visitor. */
export function visitorLabel(conversation: Conversation): string {
  const visitor = conversation.visitor;

  if (visitor?.name) return visitor.name;
  if (visitor?.email) return visitor.email;

  return `Khách #${conversation.visitorId.slice(-6)}`;
}
