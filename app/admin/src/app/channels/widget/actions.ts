"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getToken } from "@/lib/session";
import {
  DEFAULT_AWAY_MESSAGE,
  DEFAULT_BUSY_MESSAGE,
  MAX_ORIGINS,
  TIME_PATTERN,
  findInvalidOrigin,
  parseOrigins,
  type OfficeHours,
  type Site,
} from "@/lib/sites";

export type SiteActionState = { error?: string; success?: string };

const PAGE_PATH = "/channels/widget";

const THEME_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * The api enforces admin-only on every mutating site route; this check is here
 * so the operator gets a readable message instead of a bare 403.
 */
async function requireAdminToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const actor = await getCurrentUser();

  if (!actor || actor.role !== "admin") {
    return { ok: false, error: "Chỉ Quản trị viên mới được quản lý kênh widget." };
  }

  const token = await getToken();

  if (!token) {
    return { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  }

  return { ok: true, token };
}

type SitePayload = {
  name: string;
  allowedOrigins: string[];
  settings: {
    title: string;
    themeColor: string;
    greeting: string;
    imageUrl: string;
    busyMessage: string;
    awayMessage: string;
  };
  /** Omitted by the create form, which does not ask about a schedule. */
  officeHours?: OfficeHours;
};

/**
 * The schedule is only submitted by the edit panel. Returns undefined when the
 * form did not carry it, so a create never overwrites the defaults.
 */
function readOfficeHours(form: FormData): { officeHours?: OfficeHours } | { error: string } {
  if (form.get("officeHoursPresent") !== "1") {
    return {};
  }

  const timezone = String(form.get("officeHoursTimezone") ?? "").trim();
  const from = String(form.get("officeHoursFrom") ?? "").trim();
  const to = String(form.get("officeHoursTo") ?? "").trim();
  const offlineMessage = String(form.get("officeHoursOfflineMessage") ?? "").trim();
  const enabled = form.get("officeHoursEnabled") === "on";
  const weekdays = form
    .getAll("officeHoursWeekdays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

  if (!TIME_PATTERN.test(from) || !TIME_PATTERN.test(to)) {
    return { error: "Giờ làm việc phải ở dạng HH:mm, ví dụ 08:00." };
  }
  if (from === to) {
    return { error: "Giờ mở và giờ đóng không được trùng nhau." };
  }
  if (!offlineMessage || offlineMessage.length > 300) {
    return { error: "Lời nhắn ngoài giờ phải có từ 1 đến 300 ký tự." };
  }
  if (enabled && weekdays.length === 0) {
    return { error: "Chọn ít nhất một ngày làm việc, hoặc tắt khai báo giờ làm việc." };
  }

  // Checked against the runtime's own zone database: a zone the server cannot
  // evaluate would silently make the project look always-open.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: `Múi giờ "${timezone}" không hợp lệ. Ví dụ đúng: Asia/Ho_Chi_Minh.` };
  }

  return {
    officeHours: {
      enabled,
      timezone,
      weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
      from,
      to,
      offlineMessage,
    },
  };
}

function readForm(form: FormData): { payload: SitePayload } | { error: string } {
  const imageUrl = String(form.get("imageUrl") ?? "").trim();
  if (imageUrl.length > 50000 || !/^(?:https?:\/\/[^\s]+|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})?$/.test(imageUrl)) {
    return { error: "Ảnh phải là URL HTTP(S) hoặc ảnh PNG/JPEG/WebP hợp lệ, tối đa 50.000 ký tự." };
  }
  const name = String(form.get("name") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const greeting = String(form.get("greeting") ?? "").trim();
  const themeColor = String(form.get("themeColor") ?? "").trim();
  const allowedOrigins = parseOrigins(String(form.get("allowedOrigins") ?? ""));
  // Blank means "use the wording the widget ships with", matching how the api
  // reads a missing field.
  const busyMessage = String(form.get("busyMessage") ?? "").trim() || DEFAULT_BUSY_MESSAGE;
  const awayMessage = String(form.get("awayMessage") ?? "").trim() || DEFAULT_AWAY_MESSAGE;

  if (!name || name.length > 100) {
    return { error: "Tên site phải có từ 1 đến 100 ký tự." };
  }
  if (!title || title.length > 60) {
    return { error: "Tiêu đề hộp chat phải có từ 1 đến 60 ký tự." };
  }
  if (!greeting || greeting.length > 200) {
    return { error: "Lời chào phải có từ 1 đến 200 ký tự." };
  }
  if (!THEME_COLOR_PATTERN.test(themeColor)) {
    return { error: "Màu chủ đề phải ở dạng mã hex, ví dụ #EA580C." };
  }
  if (busyMessage.length > 300) {
    return { error: "Lời nhắn khi bận phải có từ 1 đến 300 ký tự." };
  }
  if (awayMessage.length > 300) {
    return { error: "Lời nhắn khi tạm vắng phải có từ 1 đến 300 ký tự." };
  }
  if (allowedOrigins.length > MAX_ORIGINS) {
    return { error: `Chỉ khai báo được tối đa ${MAX_ORIGINS} origin.` };
  }

  const invalid = findInvalidOrigin(allowedOrigins);

  if (invalid) {
    return {
      error: `"${invalid}" không phải origin hợp lệ. Dạng đúng là https://example.com, không kèm đường dẫn.`,
    };
  }

  const hours = readOfficeHours(form);

  if ("error" in hours) {
    return { error: hours.error };
  }

  return {
    payload: {
      name,
      allowedOrigins,
      settings: { title, themeColor, greeting, imageUrl, busyMessage, awayMessage },
      ...(hours.officeHours ? { officeHours: hours.officeHours } : {}),
    },
  };
}

export async function saveSite(
  _previous: SiteActionState,
  form: FormData,
): Promise<SiteActionState> {
  const auth = await requireAdminToken();

  if (!auth.ok) {
    return { error: auth.error };
  }

  const parsed = readForm(form);

  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const id = String(form.get("id") ?? "");

  const result = await apiFetch<Site>(id ? `/sites/${encodeURIComponent(id)}` : "/sites", {
    method: id ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify(parsed.payload),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(PAGE_PATH);

  return {
    success: id
      ? "Đã lưu. Thay đổi có hiệu lực ngay khi khách tải lại trang."
      : `Đã tạo site "${result.data.name}". Copy đoạn mã nhúng bên dưới và dán vào website.`,
  };
}

export async function setSiteActive(id: string, active: boolean): Promise<SiteActionState> {
  const auth = await requireAdminToken();

  if (!auth.ok) {
    return { error: auth.error };
  }

  const result = await apiFetch<Site>(`/sites/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ active }),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(PAGE_PATH);

  return {
    success: active
      ? "Đã bật lại widget cho site này."
      : "Đã tắt widget. Khách đang mở trang sẽ không mở được hội thoại mới.",
  };
}

/**
 * Invalidates the old key: every page still serving the previous snippet stops
 * being able to start a conversation, so the caller must warn first.
 */
export async function rotateSiteKey(id: string): Promise<SiteActionState> {
  const auth = await requireAdminToken();

  if (!auth.ok) {
    return { error: auth.error };
  }

  const result = await apiFetch<Site>(`/sites/${encodeURIComponent(id)}/rotate-key`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(PAGE_PATH);

  return { success: "Đã cấp key mới. Hãy cập nhật đoạn mã nhúng trên website ngay." };
}

export async function deleteSite(id: string): Promise<SiteActionState> {
  const auth = await requireAdminToken();
  if (!auth.ok) return { error: auth.error };
  const result = await apiFetch('/sites/' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.token } });
  if (!result.ok) return { error: result.error };
  revalidatePath(PAGE_PATH);
  return { success: 'Đã xóa Site khỏi danh sách. Lịch sử chat được giữ lại.' };
}
