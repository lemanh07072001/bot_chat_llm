import type { NextRequest } from "next/server";
import { getSiteCanned, saveSiteCanned } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/** A project's own set. Readable by its owner and managers; written by the owner. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await getSiteCanned(id);

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
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

  let payload: { version?: unknown; templates?: unknown; mode?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await saveSiteCanned(id, {
    version: Number(payload.version ?? 0),
    templates: Array.isArray(payload.templates) ? (payload.templates as never) : [],
    mode: typeof payload.mode === "string" ? (payload.mode as never) : undefined,
  });

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}
