/**
 * Wire contracts for the notification centre. Mirrors the api payloads; safe to
 * import from Client Components (no server-only imports here).
 */

export type NotificationKind =
  | "conversation_new"
  | "assigned"
  | "contact_left"
  | "missed"
  | "ticket_new"
  | "ticket_assigned";

export type NotificationView = {
  id: string;
  projectId: string;
  conversationId: string | null;
  /** Set for ticket notifications; those link to /tickets instead of the inbox. */
  ticketId?: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResult = {
  items: NotificationView[];
  unreadCount: number;
  nextCursor: string | null;
};

/** Sent for every visitor message to the agents whose scope includes it. */
export type NotificationMessageEvent = {
  messageId: string;
  conversationId: string;
  projectId: string;
  assignedAgentId: string | null;
  visitorLabel: string;
  preview: string;
  createdAt: string;
  notificationId?: string;
};

export type NotificationReadEvent = {
  id: string | null;
  all: boolean;
  unreadCount: number;
};

export type NotifyScope = "mine_unassigned" | "mine" | "all";

export const NOTIFY_SCOPE_OPTIONS: { value: NotifyScope; label: string }[] = [
  { value: "mine_unassigned", label: "Hội thoại của tôi + chưa giao" },
  { value: "mine", label: "Chỉ của tôi" },
  { value: "all", label: "Tất cả" },
];

export function isNotifyScope(value: unknown): value is NotifyScope {
  return value === "mine_unassigned" || value === "mine" || value === "all";
}

const CONVERSATION_ID = /^[a-f0-9]{24}$/;

/**
 * A notification only ever links into the inbox; anything that is not a plain
 * Mongo id is dropped so a payload cannot decide where the panel navigates.
 */
export function inboxUrl(conversationId: string | null | undefined): string {
  return conversationId && CONVERSATION_ID.test(conversationId)
    ? `/inbox?conversation=${conversationId}`
    : "/inbox";
}

/** Same rule for tickets: only a plain Mongo id makes it into the link. */
export function ticketUrl(ticketId: string | null | undefined): string {
  return ticketId && CONVERSATION_ID.test(ticketId) ? `/tickets?ticket=${ticketId}` : "/tickets";
}

/** Where a notification leads: its ticket when it has one, else the inbox. */
export function notificationUrl(input: {
  conversationId?: string | null;
  ticketId?: string | null;
}): string {
  return input.ticketId ? ticketUrl(input.ticketId) : inboxUrl(input.conversationId);
}

/** "vừa xong" · "2 phút trước" · "3 giờ trước" · "hôm qua" · "12/03". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "hôm qua";
  if (days < 7) return `${days} ngày trước`;

  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}
