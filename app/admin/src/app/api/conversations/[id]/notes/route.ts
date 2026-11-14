import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const query = new URLSearchParams();
  const before = request.nextUrl.searchParams.get("before");
  if (before) query.set("before", before);
  const result = await apiFetch(`/conversations/${encodeURIComponent(id)}/notes?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  return result.ok ? Response.json(result.data) : Response.json({ error: result.error }, { status: result.status || 500 });
}

export async function POST(request: NextRequest, context: Context) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("body" in body) || typeof body.body !== "string" || !body.body.trim() || body.body.length > 4000) {
    return Response.json({ error: "Ghi chú phải có từ 1 đến 4000 ký tự." }, { status: 400 });
  }
  const { id } = await context.params;
  const result = await apiFetch(`/conversations/${encodeURIComponent(id)}/notes`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ body: body.body }),
  });
  return result.ok ? Response.json(result.data, { status: 201 }) : Response.json({ error: result.error }, { status: result.status || 500 });
}
