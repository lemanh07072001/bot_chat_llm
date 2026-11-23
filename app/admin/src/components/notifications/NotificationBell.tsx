"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  ChevronDown,
  Contact,
  Loader2,
  Mail,
  MessageSquare,
  Ticket,
  TriangleAlert,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useNotifications } from "./NotificationsProvider";
import {
  inboxUrl,
  relativeTime,
  ticketUrl,
  type NotificationKind,
  type NotificationView,
} from "@/lib/notifications";

/** Icon + colour per notification kind, so the list reads at a glance. */
const KIND_STYLES: Record<
  NotificationKind,
  { icon: typeof Bell; dot: string; badge: string }
> = {
  conversation_new: { icon: MessageSquare, dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  assigned: { icon: UserPlus, dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  contact_left: { icon: Contact, dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700" },
  missed: { icon: TriangleAlert, dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700" },
  ticket_new: { icon: Ticket, dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  ticket_assigned: { icon: UserCheck, dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700" },
};

function styleFor(kind: NotificationKind) {
  return KIND_STYLES[kind] ?? KIND_STYLES.conversation_new;
}

export function NotificationBell() {
  const router = useRouter();
  const { items, unreadCount, hasMore, loading, error, loadMore, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click-away and Escape; the popover is not modal, so nothing else should trap.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openItem = (item: NotificationView) => {
    setOpen(false);
    if (!item.readAt) void markRead(item.id);
    if (item.ticketId) {
      router.push(ticketUrl(item.ticketId));
      return;
    }
    if (item.conversationId) {
      // Lets the inbox select a conversation that is not in its loaded page.
      window.dispatchEvent(
        new CustomEvent("inbox:open-conversation", {
          detail: { conversationId: item.conversationId },
        }),
      );
    }
    router.push(inboxUrl(item.conversationId));
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="relative p-2 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer"
        title="Thông báo"
      >
        {unreadCount > 0 ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-600 text-white text-[9px] font-bold leading-4 text-center tabular-nums ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-black/[0.08] z-50 text-xs animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-black/[0.06]">
            <span className="font-semibold text-neutral-900">Thông báo</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[10px] text-[#EA580C] font-semibold cursor-pointer hover:underline"
              >
                Đánh dấu đã đọc
              </button>
            ) : (
              <span className="text-[10px] text-neutral-400">Đã xem hết</span>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-neutral-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang tải…</span>
              </div>
            )}

            {!loading && error && items.length === 0 && (
              <div className="px-4 py-6 text-center text-neutral-500">
                Không tải được thông báo. Vui lòng thử lại sau.
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-8 text-center text-neutral-400">Chưa có thông báo nào</div>
            )}

            {items.length > 0 && (
              <ul className="divide-y divide-black/[0.04]">
                {items.map((item) => {
                  const style = styleFor(item.kind);
                  const Icon = style.icon;
                  const unread = !item.readAt;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={`w-full text-left px-4 py-2.5 flex gap-2.5 items-start transition-colors cursor-pointer ${
                          unread ? "bg-amber-50/40 hover:bg-amber-50/70" : "hover:bg-neutral-50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${style.badge}`}
                        >
                          <Icon className="w-3 h-3" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`truncate text-[11px] ${
                                unread ? "font-semibold text-neutral-900" : "font-medium text-neutral-700"
                              }`}
                            >
                              {item.title}
                            </span>
                            {unread && (
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                            )}
                          </span>
                          <span className="block text-neutral-500 text-[10px] truncate mt-0.5">
                            {item.body}
                          </span>
                          <span className="block text-[9px] text-neutral-400 mt-0.5">
                            {relativeTime(item.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasMore && (
              <div className="p-2 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium text-neutral-600 hover:bg-neutral-50 cursor-pointer"
                >
                  <ChevronDown className="w-3 h-3" />
                  Xem thêm
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
