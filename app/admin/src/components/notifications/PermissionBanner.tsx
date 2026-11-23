"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useNotifications } from "./NotificationsProvider";

const DISMISS_KEY = "cc-notify-permission-dismissed";

/**
 * Once-per-browser nudge. Asking from a button keeps the browser's own prompt
 * tied to a gesture, and the dismissal is remembered so it does not nag.
 */
export function PermissionBanner() {
  const { permission, requestPermission } = useNotifications();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (permission !== "default" || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode without storage: the banner just comes back next visit.
    }
  };

  return (
    <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 flex items-center gap-3 text-xs text-amber-900">
      <Bell className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 min-w-0">
        Bật thông báo để không bỏ lỡ tin nhắn của khách.
      </span>
      <button
        type="button"
        onClick={() => void requestPermission()}
        className="shrink-0 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 px-2.5 py-1 text-white font-medium shadow-2xs cursor-pointer"
      >
        Bật thông báo
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ẩn nhắc nhở"
        className="shrink-0 p-0.5 text-amber-700 hover:text-amber-900 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
