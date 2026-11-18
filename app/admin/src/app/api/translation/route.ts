import type { NextRequest } from "next/server";
import { translatePreview } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/**
 * Translating a draft before it is sent. Cookie-authenticated, so the origin is
 * checked the same way the canned-reply writes check it.
 */
export async function POST(request: NextRequest) {
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

  let payload: { text?: unknown; target?: unknown; source?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  if (typeof payload.text !== "string" || typeof payload.target !== "string") {
    return Response.json({ error: "Thiếu nội dung hoặc ngôn ngữ đích." }, { status: 400 });
  }

  const result = await translatePreview({
    text: payload.text,
    target: payload.target,
    ...(typeof payload.source === "string" ? { source: payload.source } : {}),
  });

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}
