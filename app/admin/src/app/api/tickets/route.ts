import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

const PASSTHROUGH = ["status", "siteId", "assigneeId", "q", "page"] as const;

/** Lists tickets the caller may see (admin: all; agent: assigned to self). */
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const query = new URLSearchParams();
  for (const key of PASSTHROUGH) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const qs = query.toString();

  const result = await apiFetch(qs ? `/tickets?${qs}` : "/tickets", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
