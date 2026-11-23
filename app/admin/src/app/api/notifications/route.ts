import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

/**
 * Proxies the notification centre list through the server so the browser never
 * needs a bearer token of its own. `before` walks backwards for "Xem thêm".
 */
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const requested = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(requested) && requested > 0 && requested <= 50 ? requested : 20;
  const before = request.nextUrl.searchParams.get("before");
  const query = new URLSearchParams({ limit: String(limit) });
  if (before) query.set("before", before);

  const result = await apiFetch(`/notifications?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
