const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; code?: string };

function normalizeMessage(message: unknown): string {
  if (Array.isArray(message)) return message.join(", ");
  if (typeof message === "string" && message.length > 0) return message;
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}

/**
 * Small typed fetch helper for server-side code. Returns either the parsed
 * data or a normalized error message instead of throwing.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  if (!API_URL) {
    return {
      ok: false,
      error: "Chưa cấu hình API_URL.",
      status: 0,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: init?.cache ?? "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "Không thể kết nối máy chủ. Vui lòng thử lại sau.",
      status: 0,
    };
  }

  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { message?: unknown; code?: unknown };
      if (body?.message) message = normalizeMessage(body.message);
      if (typeof body?.code === "string") code = body.code;
    } catch {
      // response had no JSON body; keep the generic message
    }
    return { ok: false, error: message, status: res.status, code };
  }

  try {
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: "Phản hồi không hợp lệ từ máy chủ.",
      status: res.status,
    };
  }
}
