import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { MAX_ATTACHMENTS } from "@/lib/attachments";
import { getToken } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * { body?: 0..4000 chars, attachmentIds?: up to 5 upload ids } — at least one of
 * them; appended to the visitor's chat and emailed.
 */
export async function POST(request: NextRequest, context: Context) {
  const token = await getToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const rawText = "body" in body ? body.body : undefined;
  if (rawText !== undefined && typeof rawText !== "string") {
    return Response.json({ error: "Nội dung trả lời không hợp lệ." }, { status: 400 });
  }
  const text = (rawText ?? "").trim();
  if (text.length > 4000) {
    return Response.json({ error: "Trả lời tối đa 4000 ký tự." }, { status: 400 });
  }

  const rawIds = "attachmentIds" in body ? body.attachmentIds : undefined;
  if (
    rawIds !== undefined &&
    (!Array.isArray(rawIds) || !rawIds.every((id): id is string => typeof id === "string" && OBJECT_ID.test(id)))
  ) {
    return Response.json({ error: "Ảnh không hợp lệ hoặc đã được dùng." }, { status: 400 });
  }
  const attachmentIds = rawIds ? [...new Set(rawIds as string[])] : [];
  if (attachmentIds.length > MAX_ATTACHMENTS) {
    return Response.json({ error: `Tối đa ${MAX_ATTACHMENTS} ảnh mỗi lần gửi.` }, { status: 400 });
  }
  if (!text && attachmentIds.length === 0) {
    return Response.json({ error: "Trả lời cần có nội dung hoặc ảnh." }, { status: 400 });
  }
  const { id } = await context.params;

  const result = await apiFetch(`/tickets/${encodeURIComponent(id)}/replies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      ...(text ? { body: text } : {}),
      ...(attachmentIds.length ? { attachmentIds } : {}),
    }),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 500 });
  return Response.json(result.data, { status: 201 });
}
