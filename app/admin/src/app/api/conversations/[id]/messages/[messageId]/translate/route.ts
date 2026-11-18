import type { NextRequest } from "next/server";
import { translateMessage } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/** Translating one stored message; the api keeps the result on the message. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> },
) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let originHost: string;
  try {
    originHost = new URL(request.headers.get("origin") ?? "").host;
  } catch {
    return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });
  }
  if (originHost !== request.headers.get("host")) {
    return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });
  }

  let payload: { target?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const { id, messageId } = await context.params;
  const result = await translateMessage(
    id,
    messageId,
    typeof payload.target === "string" ? payload.target : "vi",
  );

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}
