/**
 * The wire contracts shared by the api, the admin panel and (via the copied
 * sources) the realtime gateway. Plain data only, so every process can use it
 * unchanged.
 */

export type NotificationKind =
  | 'conversation_new'
  | 'assigned'
  | 'contact_left'
  | 'missed'
  | 'ticket_new'
  | 'ticket_assigned';

export const NOTIFICATION_TITLES: Record<NotificationKind, string> = {
  conversation_new: 'Khách mới cần hỗ trợ',
  assigned: 'Bạn được giao hội thoại',
  contact_left: 'Khách để lại thông tin liên hệ',
  missed: 'Tin nhắn chưa được trả lời',
  ticket_new: 'Ticket mới cần xử lý',
  ticket_assigned: 'Bạn được giao ticket',
};

/** Shown when the visitor left neither a name nor an email. */
export const UNKNOWN_VISITOR_LABEL = 'Khách';

export interface NotificationView {
  id: string;
  projectId: string;
  conversationId: string | null;
  /** Set for ticket bells; they deep link to the ticket instead of the inbox. */
  ticketId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

/** `notification:message`: one per visitor message, to everyone in scope. */
export interface NotificationMessageEvent {
  messageId: string;
  conversationId: string;
  projectId: string;
  assignedAgentId: string | null;
  visitorLabel: string;
  preview: string;
  createdAt: string;
  notificationId?: string;
}

/** `notification:read`: keeps every tab of one person on the same badge. */
export interface NotificationReadEvent {
  id: string | null;
  all: boolean;
  unreadCount: number;
}

/** The admin panel's deep link for a conversation. */
export function inboxUrl(conversationId: string | null | undefined): string {
  return conversationId ? `/inbox?conversation=${conversationId}` : '/inbox';
}
