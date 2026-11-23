import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const result = await apiFetch(`/tickets/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}

/** Status change: { status: 'new' | 'in_progress' | 'done' }. */
export async function PATCH(request: NextRequest, context: Context) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }
  const status = body && typeof body === "object" && "status" in body ? body.status : undefined;
  if (status !== "new" && status !== "in_progress" && status !== "done") {
    return Response.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
  }
  const { id } = await context.params;

  const result = await apiFetch(`/tickets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data);
}
