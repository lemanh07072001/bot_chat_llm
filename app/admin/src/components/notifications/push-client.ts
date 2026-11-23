/**
 * Web Push helpers for the admin panel.
 *
 * Everything here is best effort: a browser without service workers, a server
 * without VAPID keys or a route that answers 404 must degrade to "push not
 * available", never to a broken settings dialog or a blocked logout.
 */

export type PushErrorCode =
  | "unsupported"
  | "push-disabled"
  | "permission-denied"
  | "subscribe-failed";

/** Carries a machine-readable code so the UI can pick a specific hint. */
export class PushError extends Error {
  readonly code: PushErrorCode;

  constructor(code: PushErrorCode, message: string) {
    super(message);
    this.name = "PushError";
    this.code = code;
  }
}

const SW_URL = "/sw.js";
const SW_SCOPE = "/";
/** A logout must not wait on a dead push endpoint. */
const DISABLE_TIMEOUT_MS = 1500;
const REQUEST_TIMEOUT_MS = 8000;
const WORKER_READY_TIMEOUT_MS = 10000;

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Base64url (VAPID key) to the bytes `applicationServerKey` expects. */
function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** fetch that never throws and never hangs; null means "no answer". */
async function fetchQuietly(url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Registers `/sw.js` for the whole origin. Idempotent: an existing registration
 * is reused so enabling push from two dialogs cannot create a second worker.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (existing) return existing;
    return await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  } catch {
    return null;
  }
}

/** Same as `registerServiceWorker`, but never creates a worker. */
async function existingRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? null;
  } catch {
    return null;
  }
}

/**
 * `serviceWorker.ready` never settles while no worker is active, so it is raced
 * against a timeout instead of freezing the settings dialog.
 */
async function waitForActiveWorker(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new PushError("subscribe-failed", "Service worker chưa sẵn sàng.")),
      WORKER_READY_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * This device's current subscription, or null. Registers the worker if needed
 * because an unregistered worker means "not subscribed" anyway.
 */
export async function getDeviceSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await registerServiceWorker();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** The server's VAPID public key, or null when push is not configured/available. */
export async function getPushPublicKey(): Promise<string | null> {
  const response = await fetchQuietly("/api/push/public-key", { cache: "no-store" }, REQUEST_TIMEOUT_MS);
  if (!response || !response.ok) return null;
  try {
    const data = (await response.json()) as { publicKey?: unknown };
    return typeof data.publicKey === "string" && data.publicKey.trim() ? data.publicKey : null;
  } catch {
    return null;
  }
}

/**
 * Asks for permission, subscribes this browser and registers the subscription
 * with the server. Throws a `PushError` when it cannot finish; a subscription
 * the server refused is dropped so the toggle cannot lie about its state.
 */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new PushError("unsupported", "Trình duyệt không hỗ trợ thông báo đẩy.");
  }

  const publicKey = await getPushPublicKey();
  if (!publicKey) {
    throw new PushError("push-disabled", "Máy chủ chưa bật thông báo đẩy.");
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new PushError("unsupported", "Không đăng ký được service worker.");
  }

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushError("permission-denied", "Trình duyệt chưa cho phép thông báo.");
  }

  // A freshly registered worker is still installing; `pushManager.subscribe`
  // needs an active one, so wait for it (bounded) instead of failing outright.
  let active: ServiceWorkerRegistration;
  try {
    active = await waitForActiveWorker();
  } catch {
    throw new PushError("subscribe-failed", "Không đăng ký được thiết bị này.");
  }

  let subscription: PushSubscription | null = null;
  try {
    subscription = await active.pushManager.getSubscription();
  } catch {
    subscription = null;
  }

  if (!subscription) {
    try {
      subscription = await active.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      });
    } catch {
      throw new PushError("subscribe-failed", "Không đăng ký được thiết bị này.");
    }
  }

  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? "";
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";

  const saved =
    endpoint && p256dh && auth
      ? await fetchQuietly(
          "/api/push/subscribe",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
          },
          REQUEST_TIMEOUT_MS,
        )
      : null;

  if (saved && saved.ok) return;

  // The route is missing on an older deployment: push cannot work, but the
  // browser subscription itself is still valid for a later rollout.
  if (saved && (saved.status === 404 || saved.status === 501)) {
    throw new PushError("push-disabled", "Máy chủ chưa hỗ trợ đăng ký thông báo đẩy.");
  }

  await subscription.unsubscribe().catch(() => {});
  throw new PushError("subscribe-failed", "Không lưu được đăng ký trên máy chủ.");
}

/**
 * Forgets this device: tells the server first (best effort, short timeout) and
 * then drops the browser subscription. Never throws.
 */
export async function disablePush(): Promise<void> {
  const registration = await existingRegistration();
  if (!registration) return;

  let subscription: PushSubscription | null = null;
  try {
    subscription = await registration.pushManager.getSubscription();
  } catch {
    subscription = null;
  }
  if (!subscription) return;

  await fetchQuietly(
    "/api/push/unsubscribe",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    },
    DISABLE_TIMEOUT_MS,
  );

  try {
    await subscription.unsubscribe();
  } catch {
    // Already gone, or the browser refused; nothing left to clean up.
  }
}
