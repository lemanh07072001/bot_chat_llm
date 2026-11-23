"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocketEvent } from "@/components/notifications/NotificationsProvider";

const REFETCH_DEBOUNCE_MS = 300;

/**
 * Sidebar badge for /tickets: admins see new tickets, agents their open ones.
 * Any failure (including a missing route) shows no badge rather than a stale one.
 */
export function useTicketBadge(): number {
  const [badge, setBadge] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch("/api/tickets/summary", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("summary");
      const data = (await response.json()) as { badge?: unknown };
      const next = typeof data.badge === "number" && data.badge > 0 ? data.badge : 0;
      if (!controller.signal.aborted) setBadge(next);
    } catch {
      if (!controller.signal.aborted) setBadge(0);
    }
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void load();
    }, REFETCH_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    void load();
    window.addEventListener("focus", schedule);
    return () => {
      window.removeEventListener("focus", schedule);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      controllerRef.current?.abort();
    };
  }, [load, schedule]);

  useSocketEvent("ticket:changed", schedule);

  return badge;
}
