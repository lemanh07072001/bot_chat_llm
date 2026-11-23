import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

/** Admin-only on the api: { agentId: string | null }. */
export async function POST(request: NextRequest, context: Context) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }
  const agentId = body && typeof body === "object" && "agentId" in body ? body.agentId : undefined;
  if (agentId !== null && (typeof agentId !== "string" || !agentId)) {
    return Response.json({ error: "Người được giao không hợp lệ." }, { status: 400 });
  }
  const { id } = await context.params;

  const result = await apiFetch(`/tickets/${encodeURIComponent(id)}/assign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ agentId }),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data);
}
