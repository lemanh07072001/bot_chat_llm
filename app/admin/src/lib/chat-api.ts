import { apiFetch, type ApiResult } from "@/lib/api";
import { getToken } from "@/lib/session";
import type {
  ChatMessage,
  Conversation,
  ConversationCounts,
  ProjectRef,
} from "@/lib/chat";
import type { MemberRole, Site } from "@/lib/sites";

/**
 * Server-only: reads the httpOnly session cookie via next/headers. Importing
 * this from a Client Component breaks the build — use `chat.ts` there.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();

  return query ? `${path}?${query}` : path;
}

export type ConversationListResult = {
  conversations: Conversation[];
  counts: ConversationCounts;
  hasMore: boolean;
  nextCursor: string | null;
  /** The projects the caller belongs to — the scope of everything above. */
  projects: ProjectRef[];
};

export async function listConversations(
  params: {
    status?: string;
    assignment?: string;
    search?: string;
    before?: string;
    limit?: number;
  } = {},
): Promise<ApiResult<ConversationListResult>> {
  return apiFetch(withQuery("/conversations", params), { headers: await authHeaders() });
}

export type MessageListResult = {
  conversation: Conversation;
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
};

export async function listMessages(
  conversationId: string,
  params: { before?: string; limit?: number } = {},
): Promise<ApiResult<MessageListResult>> {
  return apiFetch(
    withQuery(`/conversations/${encodeURIComponent(conversationId)}/messages`, params),
    { headers: await authHeaders() },
  );
}

/** claim · release · close · reopen take no body; assign needs an agent. */
export type ConversationAction = "claim" | "release" | "close" | "reopen" | "assign";

export async function runConversationAction(
  conversationId: string,
  action: ConversationAction,
  body?: { agentId: string },
): Promise<ApiResult<{ conversation: Conversation }>> {
  return apiFetch(`/conversations/${encodeURIComponent(conversationId)}/${action}`, {
    method: "POST",
    headers: await authHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function createWsTicket(): Promise<
  ApiResult<{ ticket: string; expiresIn: number }>
> {
  return apiFetch("/auth/ws-ticket", {
    method: "POST",
    headers: await authHeaders(),
  });
}

// --- Projects --------------------------------------------------------------

export type SiteMemberView = {
  userId: string;
  name: string;
  email: string | null;
  role: MemberRole;
  addedAt: string | null;
};

export async function listSites(): Promise<ApiResult<Site[]>> {
  return apiFetch("/sites", { headers: await authHeaders(), cache: "no-store" });
}

export async function listSiteMembers(
  siteId: string,
): Promise<ApiResult<{ members: SiteMemberView[] }>> {
  return apiFetch(`/sites/${encodeURIComponent(siteId)}/members`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
}

export async function addSiteMember(
  siteId: string,
  userId: string,
): Promise<ApiResult<{ members: SiteMemberView[] }>> {
  return apiFetch(`/sites/${encodeURIComponent(siteId)}/members`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ userId }),
  });
}

export async function removeSiteMember(
  siteId: string,
  userId: string,
): Promise<ApiResult<{ members: SiteMemberView[] }>> {
  return apiFetch(
    `/sites/${encodeURIComponent(siteId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: await authHeaders() },
  );
}
