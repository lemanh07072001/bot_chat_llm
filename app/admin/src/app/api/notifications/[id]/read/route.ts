import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

/** Marks one notification as read. Takes no body. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let originHost: string;
  try { originHost = new URL(request.headers.get("origin") ?? "").host; }
  catch { return Response.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  if (originHost !== request.headers.get("host")) return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });

  const { id } = await context.params;
  if (!/^[a-f0-9]{24}$/.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const result = await apiFetch(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data);
}
