import type { NextRequest } from "next/server";
import { runConversationAction, type ConversationAction } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

const ALLOWED: ConversationAction[] = ["claim", "release", "close", "reopen", "assign"];

/**
 * One entry point for the inbox's conversation actions. The action name is
 * matched against a fixed list rather than interpolated, so a crafted body
 * cannot reach any other api route. Authorization itself is the api's job —
 * it re-checks project membership on every one of these.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let payload: { action?: unknown; agentId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const action = ALLOWED.find((candidate) => candidate === payload.action);

  if (!action) {
    return Response.json({ error: "Hành động không hợp lệ." }, { status: 400 });
  }

  if (action === "assign" && typeof payload.agentId !== "string") {
    return Response.json({ error: "Thiếu người được giao." }, { status: 400 });
  }

  const result = await runConversationAction(
    id,
    action,
    action === "assign" ? { agentId: payload.agentId as string } : undefined,
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 500 });
  }

  return Response.json(result.data);
}
