import type { NextRequest } from "next/server";
import { removeSiteMember } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, userId } = await context.params;
  const result = await removeSiteMember(id, userId);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 500 });
  }

  return Response.json(result.data);
}
