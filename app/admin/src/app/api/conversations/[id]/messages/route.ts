import type { NextRequest } from "next/server";
import { listMessages } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/**
 * Proxies the thread read through the server so the browser never needs a
 * bearer token of its own; the httpOnly session cookie does the work.
 * `before` walks backwards through history as the agent scrolls up.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const limit = Number(request.nextUrl.searchParams.get("limit"));

  const result = await listMessages(id, {
    before: request.nextUrl.searchParams.get("before") ?? undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 500 });
  }

  return Response.json(result.data);
}
