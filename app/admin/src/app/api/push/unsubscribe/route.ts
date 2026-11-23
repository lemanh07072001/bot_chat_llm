import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

/** Drops this browser's push subscription (also used on logout, best effort). */
export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let originHost: string;
  try { originHost = new URL(request.headers.get("origin") ?? "").host; }
  catch { return Response.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  if (originHost !== request.headers.get("host")) return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });

  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Body không hợp lệ." }, { status: 400 }); }

  const result = await apiFetch("/push/unsubscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data);
}
