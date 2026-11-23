import type { AttachmentView } from '../attachments/attachment.types.js';

export const TICKET_STATUSES = ['new', 'in_progress', 'done'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKETS_PAGE_SIZE = 20;

/** Who is asking. `isAdmin` is resolved by the controller (role admin + verified). */
export interface TicketActor {
  userId: string;
  isAdmin: boolean;
  name?: string;
}

export interface TicketReplyView {
  authorId: string;
  authorName: string;
  body: string;
  attachments: AttachmentView[];
  createdAt: string;
}

/** The one JSON shape staff endpoints return. Dates are ISO strings. */
export interface TicketView {
  id: string;
  number: number;
  siteId: string;
  siteName: string;
  conversationId: string;
  visitorId: string;
  name: string | null;
  email: string;
  message: string;
  attachments: AttachmentView[];
  status: TicketStatus;
  assignee: { id: string; name: string } | null;
  replies: TicketReplyView[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketListQuery {
  status?: TicketStatus;
  siteId?: string;
  assigneeId?: string;
  q?: string;
  /** 1-based. */
  page?: number;
}

export interface TicketListResult {
  items: TicketView[];
  total: number;
  counts: Record<TicketStatus, number>;
}

export interface CreateTicketInput {
  siteId: string;
  conversationId: string;
  visitorId: string;
  name: string | null;
  email: string;
  message: string;
  /** Already claimed by the caller. */
  attachments?: AttachmentView[];
}
