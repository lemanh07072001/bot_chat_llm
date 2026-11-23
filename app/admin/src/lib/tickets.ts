import { apiFetch, type ApiResult } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { AttachmentView } from "@/lib/attachments";

/**
 * Types are safe to `import type` from Client Components. The helpers below are
 * server-only: they read the httpOnly session cookie via next/headers.
 */

export type TicketStatus = "new" | "in_progress" | "done";

export const TICKET_STATUSES: readonly TicketStatus[] = ["new", "in_progress", "done"];

export type TicketReply = {
  authorId: string;
  authorName: string;
  /** May be '' when the reply only carries images. */
  body: string;
  attachments: AttachmentView[];
  createdAt: string;
};

export type TicketView = {
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
  replies: TicketReply[];
  createdAt: string;
  updatedAt: string;
};

export type TicketCounts = { new: number; in_progress: number; done: number };

export type TicketListResult = {
  items: TicketView[];
  total: number;
  counts: TicketCounts;
};

export type TicketListQuery = {
  status?: TicketStatus;
  siteId?: string;
  assigneeId?: string;
  q?: string;
  page?: number;
};

/** A staff member the admin can hand a ticket to. */
export type TicketStaff = { id: string; name: string; email: string };

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function ticketQueryString(query: TicketListQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export async function listTickets(
  query: TicketListQuery = {},
): Promise<ApiResult<TicketListResult>> {
  const qs = ticketQueryString(query);
  return apiFetch(qs ? `/tickets?${qs}` : "/tickets", {
    headers: await authHeaders(),
    cache: "no-store",
  });
}

export async function getTicket(id: string): Promise<ApiResult<TicketView>> {
  return apiFetch(`/tickets/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
}
