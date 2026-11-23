import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

/** Registers this browser's push subscription for the signed-in account. */
export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let originHost: string;
  try { originHost = new URL(request.headers.get("origin") ?? "").host; }
  catch { return Response.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  if (originHost !== request.headers.get("host")) return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });

  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Body không hợp lệ." }, { status: 400 }); }

  const result = await apiFetch("/push/subscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data);
}
