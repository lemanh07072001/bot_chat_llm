import type { NextRequest } from "next/server";
import { getEffectiveCanned } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/**
 * The sets the composer shows for one project, already narrowed by that
 * project's mode. The api checks access, so an id the caller cannot open is a
 * 404 rather than an empty list.
 */
export async function GET(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = request.nextUrl.searchParams.get("siteId");

  if (!siteId) {
    return Response.json({ error: "Thiếu siteId." }, { status: 400 });
  }

  const result = await getEffectiveCanned(siteId);

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}
