import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

export async function GET() {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await apiFetch<{ unread: number; unassignedUnread: number }>("/conversations/unread-counts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json({
    ...result.data,
    realtimeUrl: process.env.PUBLIC_REALTIME_URL ?? process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3003",
  }, { headers: { "Cache-Control": "no-store" } });
}
