import { createWsTicket } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/**
 * The session token lives in an httpOnly cookie that browser code cannot read,
 * so the inbox asks for a short-lived ticket here and uses it only for the
 * socket handshake. socket.io calls this again on every reconnect.
 */
export async function POST() {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await createWsTicket();

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 500 });
  }

  return Response.json(result.data);
}
