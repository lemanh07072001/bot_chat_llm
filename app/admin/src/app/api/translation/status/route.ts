import { getTranslationStatus } from "@/lib/chat-api";
import { getToken } from "@/lib/session";

/**
 * Whether this install has a translation provider at all. The inbox asks once
 * on mount and hides the Dịch buttons when the answer is no.
 */
export async function GET() {
  const token = await getToken();

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getTranslationStatus();

  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.error, code: result.code }, { status: result.status || 500 });
}
