"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

export function useUnreadCounts() {
  const [counts, setCounts] = useState({ unread: 0, unassignedUnread: 0 });
  useEffect(() => {
    let disposed = false;
    let socket: Socket | undefined;
    let inFlight = false;
    let refreshAgain = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      try {
        const response = await fetch("/api/unread-counts", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (disposed) return;
        setCounts({ unread: data.unread, unassignedUnread: data.unassignedUnread });
        if (!socket) {
          socket = io(data.realtimeUrl, {
            auth: (cb) => {
              fetch("/api/ws-ticket", { method: "POST" })
                .then((r) => r.ok ? r.json() : Promise.reject())
                .then((ticket) => { if (!disposed) cb({ token: ticket.ticket }); })
                .catch(() => { if (!disposed) cb({ token: "" }); });
            },
            transports: ["websocket", "polling"],
          });
          socket.on("ready", schedule);
          socket.on("conversation:updated", schedule);
          socket.on("access:granted", schedule);
          socket.on("access:revoked", schedule);
        }
      } catch { /* Preserve the last known count during transient outages. */ }
      finally {
        inFlight = false;
        if (refreshAgain && !disposed) { refreshAgain = false; schedule(); }
      }
    };
    const schedule = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => { timer = undefined; void refresh(); }, 200);
    };
    const onVisible = () => { if (!document.hidden) schedule(); };
    void refresh();
    const fallback = setInterval(schedule, 15000);
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearInterval(fallback);
      if (timer) clearTimeout(timer);
      socket?.close();
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return counts;
}
