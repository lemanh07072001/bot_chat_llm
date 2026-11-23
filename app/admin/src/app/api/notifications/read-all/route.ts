import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

/** Marks every notification of the caller as read. Takes no body. */
export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Same guard as the account mutations: a cross-site form post must not be
  // able to clear someone's notification centre.
  let originHost: string;
  try { originHost = new URL(request.headers.get("origin") ?? "").host; }
  catch { return Response.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  if (originHost !== request.headers.get("host")) return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });

  const result = await apiFetch("/notifications/read-all", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data);
}
