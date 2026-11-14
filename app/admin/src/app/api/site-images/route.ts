import { getCurrentUser, getToken } from '@/lib/session';
import { apiFetch } from '@/lib/api';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
  if (Number(request.headers.get('content-length')) > 60000) return Response.json({ error: 'Image too large' }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Missing image' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 60000) { await reader.cancel(); return Response.json({ error: 'Image too large' }, { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== 'object' || !('dataUrl' in payload) || typeof payload.dataUrl !== 'string' || payload.dataUrl.length > 50000) return Response.json({ error: 'Invalid image' }, { status: 400 });
    const result = await apiFetch<{ url: string }>('/site-images', {
      method: 'POST', headers: { Authorization: 'Bearer ' + await getToken() }, body: JSON.stringify({ dataUrl: payload.dataUrl }),
    });
    return result.ok ? Response.json(result.data) : Response.json({ error: result.error }, { status: result.status || 502 });
  } catch { return Response.json({ error: 'Invalid upload request' }, { status: 400 }); }
  finally { reader.releaseLock(); }
}
