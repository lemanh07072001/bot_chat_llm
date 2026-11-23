"use client";

import { useNotifications } from "@/components/notifications/NotificationsProvider";

/**
 * The sidebar badge. The socket and polling that used to live here moved into
 * the dashboard-wide NotificationsProvider so one connection feeds every
 * consumer; this keeps the original call site unchanged.
 */
export function useUnreadCounts() {
  return useNotifications().counts;
}
