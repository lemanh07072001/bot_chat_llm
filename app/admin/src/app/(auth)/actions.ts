"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setSession, deleteSession, type User } from "@/lib/session";

export type AuthState =
  | { error: string; unverifiedEmail?: string }
  | undefined;

export type VerifyEmailState = { error: string } | undefined;
export type ResendVerifyEmailState = { message: string } | undefined;

type AuthResponse = { accessToken: string; user: User };
type RegisterResponse = { message: string; user: User };

export async function login(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Vui lòng nhập email và mật khẩu." };
  }

  const result = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!result.ok) {
    if (result.status === 403 && result.code === "EMAIL_NOT_VERIFIED") {
      return { error: "Email chưa được kích hoạt.", unverifiedEmail: email };
    }
    return { error: result.error };
  }

  await setSession(result.data.accessToken, formData.get("remember") === "on");
  redirect("/");
}

export async function register(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !password || !name) {
    return { error: "Vui lòng điền đầy đủ thông tin." };
  }

  if (password.length < 8 || password.length > 72) {
    return { error: "Mật khẩu phải có từ 8 đến 72 ký tự." };
  }

  const result = await apiFetch<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });

  if (!result.ok) {
    // Only reachable if an account appeared between rendering the form and
    // submitting it; the page normally hides the form in this case.
    if (result.status === 403 && result.code === "REGISTRATION_CLOSED") {
      return {
        error:
          "Hệ thống đã có quản trị viên nên đăng ký công khai đã đóng. Hãy đề nghị quản trị viên tạo tài khoản cho bạn.",
      };
    }
    return { error: result.error };
  }

  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function verifyEmail(
  _prevState: VerifyEmailState,
  formData: FormData,
): Promise<VerifyEmailState> {
  const email = String(formData.get("email") ?? "").trim();
  const otp = String(formData.get("otp") ?? "").trim();

  if (!email) {
    return { error: "Thiếu email." };
  }

  if (!/^\d{6}$/.test(otp)) {
    return { error: "Mã xác nhận phải gồm 6 chữ số." };
  }

  const result = await apiFetch<AuthResponse>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  await setSession(result.data.accessToken);
  redirect("/");
}

export async function resendVerifyEmail(
  _prevState: ResendVerifyEmailState,
  formData: FormData,
): Promise<ResendVerifyEmailState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { message: "Nếu email hợp lệ, mã mới đã được gửi." };
  }

  await apiFetch("/auth/verify-email/send", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  return { message: "Nếu email hợp lệ, mã mới đã được gửi." };
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
