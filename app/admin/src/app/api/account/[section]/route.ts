import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { deleteSession, getToken } from "@/lib/session";

export async function GET() {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await apiFetch("/auth/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  return result.ok ? Response.json(result.data) : Response.json({ error: result.error }, { status: result.status || 500 });
}

export async function POST(request: NextRequest, context: { params: Promise<{ section: string }> }) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // The trusted reverse proxy preserves Host; nextUrl can use the container's
  // internal hostname in standalone production mode.
  let originHost: string;
  try { originHost = new URL(request.headers.get("origin") ?? "").host; }
  catch { return Response.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  if (originHost !== request.headers.get("host")) return Response.json({ error: "Origin không hợp lệ." }, { status: 403 });
  const { section } = await context.params;
  if (!["profile", "preferences", "password"].includes(section)) return Response.json({ error: "Not found" }, { status: 404 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Body không hợp lệ." }, { status: 400 }); }
  const result = await apiFetch(`/users/me/${section}`, {
    method: section === "password" ? "POST" : "PATCH",
    headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  if (section === "password") await deleteSession();
  return Response.json(result.data);
}
