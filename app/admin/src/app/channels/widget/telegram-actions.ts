"use server";

import { apiFetch } from "@/lib/api";
import { getCurrentUser, getToken } from "@/lib/session";

export type TelegramSettings = {
  enabled: boolean; configured: boolean; chatId: string;
  responders: { telegramId: string; userId: string }[];
  lastError: string;
};
export type TelegramInput = Pick<TelegramSettings, "enabled" | "chatId" | "responders"> & { botToken?: string };

async function request<T>(siteId: string, method: string, body?: object, suffix = "") {
  const user = await getCurrentUser();
  const token = await getToken();
  if (!token || user?.role !== "admin") return { error: "Chỉ admin được cấu hình Telegram." };
  if (!/^[a-f\d]{24}$/i.test(siteId)) return { error: "Dự án không hợp lệ." };
  try {
    const response = await apiFetch<T>(`/sites/${siteId}/telegram${suffix}`, {
      method, headers: { Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      return { error: response.error };
    }
    return { data: response.data };
  } catch { return { error: "Không kết nối được API. Vui lòng thử lại." }; }
}
export async function loadTelegram(siteId: string) { return request<TelegramSettings>(siteId, "GET"); }
export async function saveTelegram(siteId: string, input: TelegramInput) { return request<TelegramSettings>(siteId, "PUT", input); }
export async function testTelegram(siteId: string) { return request<{ success: boolean }>(siteId, "POST", {}, "/test"); }
