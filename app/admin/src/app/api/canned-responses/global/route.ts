import type { NextRequest } from "next/server";
import { getGlobalCanned, saveGlobalCanned } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/** The shared set. Readable by every signed-in member, writable by admins. */
export async function GET() {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getGlobalCanned();

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}

function sameOrigin(request: NextRequest): boolean {
  try {
    return new URL(request.headers.get("origin") ?? "").host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function PUT(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A cookie-authenticated write, so a foreign origin must not be able to
  // drive it from a page the admin happens to have open.
  if (!sameOrigin(request)) {
    return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });
  }

  let payload: { version?: unknown; templates?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const result = await saveGlobalCanned({
    version: Number(payload.version ?? 0),
    templates: Array.isArray(payload.templates) ? (payload.templates as never) : [],
  });

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}
