import type { NextRequest } from "next/server";
import { listConversations } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/**
 * Lets the inbox change tab or page without a navigation, while the bearer
 * token stays server-side — the browser only ever carries the session cookie.
 */
export async function GET(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const limit = Number(params.get("limit"));

  const result = await listConversations({
    status: params.get("status") ?? undefined,
    assignment: params.get("assignment") ?? undefined,
    search: params.get("search") ?? undefined,
    before: params.get("before") ?? undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 500 });
  }

  return Response.json(result.data);
}
