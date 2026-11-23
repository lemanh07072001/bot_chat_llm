import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

/** Sidebar badge: { badge }. */
export async function GET() {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await apiFetch("/tickets/summary", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
