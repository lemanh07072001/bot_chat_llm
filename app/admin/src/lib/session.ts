import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "agent";
  createdAt: string;
  updatedAt: string;
};

const COOKIE_NAME = "token";
const MAX_AGE_SECONDS = 60 * 60 * 24; // 1 day, matches backend token expiry

/**
 * persistent=false sets a browser-session cookie (cleared when the browser
 * closes); the token itself still expires after 1 day either way.
 */
export async function setSession(token: string, persistent = true) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // Explicit opt-out only for temporary HTTP/IP deployments.
    secure: process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false",
    path: "/",
    ...(persistent && { maxAge: MAX_AGE_SECONDS }),
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

/**
 * Whether the workspace still needs its first admin. The API closes
 * self-registration from the first account onwards, so the sign-in screens ask
 * this rather than offering a form that can only fail.
 *
 * An unreachable API counts as closed: the form would be a dead end either
 * way, and the closed screen says to check the API.
 */
export async function isRegistrationOpen(): Promise<boolean> {
  const result = await apiFetch<{ open: boolean }>("/auth/registration", {
    cache: "no-store",
  });

  return result.ok ? result.data.open : false;
}

/**
 * Returns the current authenticated user, or null if there is no valid
 * session (missing/expired token, 401 from the API, or a network error).
 */
export async function getCurrentUser(): Promise<User | null> {
  const token = await getToken();
  if (!token) return null;

  const result = await apiFetch<User>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return result.ok ? result.data : null;
}
