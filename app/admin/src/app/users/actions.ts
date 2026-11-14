"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getToken } from "@/lib/session";

export type UserActionState = { error?: string; success?: string };

export async function deleteUser(id: string): Promise<UserActionState> {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'admin') return { error: 'Bạn không có quyền quản lý người dùng.' };
  if (actor.id === id) return { error: 'Bạn không thể tự xóa tài khoản đang đăng nhập.' };
  const result = await apiFetch(`/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  if (!result.ok) return { error: result.error };
  revalidatePath('/users');
  return { success: 'Đã xóa người dùng.' };
}

export async function saveUser(_previous: UserActionState, form: FormData): Promise<UserActionState> {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") return { error: "Bạn không có quyền quản lý người dùng." };
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "agent");
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const jobTitle = String(form.get("jobTitle") ?? "").trim();
  const avatarUrl = String(form.get("avatarUrl") ?? "").trim();
  if (!name || name.length > 100) return { error: "Tên phải có từ 1 đến 100 ký tự." };
  if (!["admin", "agent"].includes(role)) return { error: "Vai trò không hợp lệ." };
  if (jobTitle.length > 60) return { error: "Chức vụ không được quá 60 ký tự." };
  // The same two shapes the api accepts: anything else would end up in an
  // <img src> inside a customer's website.
  if (avatarUrl && !/^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(avatarUrl)) {
    return { error: "Ảnh đại diện phải là URL http(s) hoặc ảnh tải lên." };
  }
  if (avatarUrl.length > 2048) return { error: "URL ảnh đại diện quá dài." };
  if (!id && (!email || password.length < 8 || password.length > 72)) {
    return { error: "Nhập email và mật khẩu từ 8 đến 72 ký tự." };
  }
  const result = await apiFetch(id ? `/users/${encodeURIComponent(id)}` : "/users", {
    method: id ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify(
      id
        ? { name, role, jobTitle, avatarUrl }
        : { name, role, email, password, jobTitle, avatarUrl },
    ),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/users");
  return {
    success: id
      ? "Đã cập nhật. Nếu bạn đổi vai trò thì người này cần đăng nhập lại."
      : "Đã tạo tài khoản và xác thực email.",
  };
}
