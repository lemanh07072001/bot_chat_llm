import type { NextRequest } from "next/server";
import { addSiteMember, listSiteMembers } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/** The people on one project. Readable by anyone the api lets onto it. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await listSiteMembers(id);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 500 });
  }

  return Response.json(result.data);
}

/** Granting access. The api allows this for the project owner only. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let payload: { userId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  if (typeof payload.userId !== "string" || !payload.userId) {
    return Response.json({ error: "Chưa chọn người cần thêm." }, { status: 400 });
  }

  const result = await addSiteMember(id, payload.userId);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 500 });
  }

  return Response.json(result.data);
}
