import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";

/**
 * The browser needs the VAPID public key to subscribe. A missing server key is
 * not an error: it comes back as null and the settings toggle stays disabled.
 */
export async function GET() {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await apiFetch<{ publicKey: string | null }>("/push/public-key", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
