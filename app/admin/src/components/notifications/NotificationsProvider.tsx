"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { playChime, unlockNotificationAudio } from "./notification-audio";
import {
  notificationUrl,
  type NotificationMessageEvent,
  type NotificationReadEvent,
  type NotificationView,
  type NotifyScope,
} from "@/lib/notifications";
import type { AccountPreferences } from "@/components/inbox/preferences";

/** The one dashboard-wide notification hub: one socket, one leader, one title. */

const PAGE_SIZE = 20;
const LEADER_LOCK = "cc-notify-leader";
const CHANNEL_NAME = "cc-notify";
/** A tab re-announces its state this often; peers drop it after two misses. */
const PRESENCE_HEARTBEAT_MS = 20000;
const PRESENCE_STALE_MS = 45000;
const REFRESH_DEBOUNCE_MS = 200;
/** The bell list is reconciled at most this often, except right after a reconnect. */
const RECONCILE_MIN_MS = 15000;
const TITLE_PREFIX = /^\(\d+\+?\)\s*/;

type Counts = { unread: number; unassignedUnread: number };
type Permission = NotificationPermission | "unsupported";

const AGENT_STATUSES = ["online", "busy", "away"] as const;
/** What the agent tells visitors about their availability. */
export type AgentStatus = (typeof AGENT_STATUSES)[number];

function isAgentStatus(value: unknown): value is AgentStatus {
  return typeof value === "string" && (AGENT_STATUSES as readonly string[]).includes(value);
}

type UnreadPayload = Counts & { notificationUnread?: number; realtimeUrl?: string };

type PresenceMessage =
  | { type: "active"; tabId: string; conversationId: string | null }
  | { type: "bye"; tabId: string };

export type NotificationsContextValue = {
  /** Sidebar badges: unchanged shape so existing consumers keep working. */
  counts: Counts;
  items: NotificationView[];
  unreadCount: number;
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  permission: Permission;
  requestPermission: () => Promise<void>;
  /** Null until the socket's `ready` tells us the stored status. */
  agentStatus: AgentStatus | null;
  agentStatusPending: boolean;
  agentStatusError: string | null;
  setAgentStatus: (status: AgentStatus) => Promise<void>;
  /** Listens to one event on the dashboard socket; returns the unsubscribe. */
  subscribeSocketEvent: (event: string, handler: SocketEventHandler) => () => void;
};

type SocketEventHandler = (payload: unknown) => void;

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function readPermission(): Permission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function newTabId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>({ unread: 0, unassignedUnread: 0 });
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [permission, setPermission] = useState<Permission>("default");

  const preferencesRef = useRef<{ soundEnabled: boolean; notifyScope: NotifyScope }>({
    soundEnabled: true,
    notifyScope: "mine_unassigned",
  });
  const activeRef = useRef<string | null>(null);
  const leaderRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peersRef = useRef(new Map<string, { conversationId: string | null; at: number }>());
  const seenRef = useRef(new Set<string>());
  const seenOrderRef = useRef<string[]>([]);
  const baseTitleRef = useRef("");
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const itemIdsRef = useRef(new Set<string>());
  const tabIdRef = useRef("");
  const lastReconcileRef = useRef(0);
  const reconcileInFlightRef = useRef(false);
  const reconcilePendingRef = useRef(false);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [agentStatus, setAgentStatusState] = useState<AgentStatus | null>(null);
  const [agentStatusPending, setAgentStatusPending] = useState(false);
  const [agentStatusError, setAgentStatusErrorState] = useState<string | null>(null);
  /** The dashboard socket, kept reachable so the status toggle can emit on it. */
  const socketRef = useRef<Socket | null>(null);
  /**
   * Extra socket listeners from other components. Dispatched from one `onAny`
   * on whichever socket is current, so they survive reconnects and recreation.
   */
  const socketHandlersRef = useRef(new Map<string, Set<SocketEventHandler>>());

  const subscribeSocketEvent = useCallback((event: string, handler: SocketEventHandler) => {
    const registry = socketHandlersRef.current;
    let handlers = registry.get(event);
    if (!handlers) {
      handlers = new Set();
      registry.set(event, handlers);
    }
    handlers.add(handler);
    return () => {
      const current = registry.get(event);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) registry.delete(event);
    };
  }, []);

  const remember = useCallback((key: string) => {
    if (seenRef.current.has(key)) return false;
    seenRef.current.add(key);
    seenOrderRef.current.push(key);
    // Bounded so a long shift cannot grow the set without limit.
    if (seenOrderRef.current.length > 200) {
      const oldest = seenOrderRef.current.shift();
      if (oldest) seenRef.current.delete(oldest);
    }
    return true;
  }, []);

  /** Another visible tab is looking at this conversation, so nobody alerts. */
  const viewedInAnotherTab = useCallback((conversationId: string | null) => {
    if (!conversationId) return false;
    const now = Date.now();
    for (const peer of peersRef.current.values()) {
      if (now - peer.at > PRESENCE_STALE_MS) continue;
      if (peer.conversationId === conversationId) return true;
    }
    return false;
  }, []);

  const alert = useCallback(
    (input: {
      key: string;
      title: string;
      body: string;
      conversationId: string | null;
      ticketId?: string | null;
    }) => {
      if (!remember(input.key)) return;
      // Sounds and desktop alerts belong to one tab; the badge and title update everywhere.
      if (!leaderRef.current) return;

      const viewingHere = !document.hidden && activeRef.current === input.conversationId;
      if (viewingHere || viewedInAnotherTab(input.conversationId)) return;

      if (preferencesRef.current.soundEnabled) playChime();

      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

      const url = notificationUrl(input);
      try {
        // `renotify` is only in the ServiceWorker flavour of NotificationOptions;
        // a page-level notification replaces the previous one with the same tag,
        // which is what we want for a conversation's stream of messages.
        const shown = new Notification(input.title, {
          body: input.body,
          icon: "/favicon.ico",
          tag: input.conversationId ?? undefined,
        });
        shown.onclick = () => {
          window.focus();
          shown.close();
          if (input.conversationId && !input.ticketId) {
            window.dispatchEvent(
              new CustomEvent("inbox:open-conversation", {
                detail: { conversationId: input.conversationId },
              }),
            );
          }
          router.push(url);
        };
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
    },
    [remember, router, viewedInAnotherTab],
  );

  // --- Preferences ---------------------------------------------------------

  useEffect(() => {
    const apply = (preferences: AccountPreferences) => {
      preferencesRef.current = {
        soundEnabled: preferences.soundEnabled ?? true,
        notifyScope: preferences.notifyScope ?? "mine_unassigned",
      };
    };
    const listener = (event: Event) =>
      apply((event as CustomEvent<AccountPreferences>).detail ?? {});
    window.addEventListener("account-preferences", listener);

    const controller = new AbortController();
    fetch("/api/account/preferences", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: AccountPreferences) => apply(data))
      .catch(() => {});

    return () => {
      controller.abort();
      window.removeEventListener("account-preferences", listener);
    };
  }, []);

  // --- Audio unlock + permission tracking ----------------------------------

  useEffect(() => {
    setPermission(readPermission());
    const unlock = () => unlockNotificationAudio();
    // The first gesture is what browsers require before any sound plays.
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    // The user may unblock notifications in the browser's site settings.
    const onVisible = () => {
      if (!document.hidden) setPermission(readPermission());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // --- Leader election -----------------------------------------------------

  useEffect(() => {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (!locks?.request) {
      // Without Web Locks every tab alerts, which beats silently dropping alerts.
      leaderRef.current = true;
      return;
    }

    // Holding the lock for as long as the tab lives is what makes it the leader;
    // releasing it on unmount hands the role to the next waiting tab.
    const holder: { release: (() => void) | null } = { release: null };
    let disposed = false;

    void locks.request(LEADER_LOCK, () => {
      if (disposed) return undefined;
      leaderRef.current = true;
      return new Promise<void>((resolve) => {
        holder.release = resolve;
      });
    });

    return () => {
      disposed = true;
      leaderRef.current = false;
      holder.release?.();
    };
  }, []);

  // --- Cross-tab presence --------------------------------------------------

  const announce = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    channel.postMessage({
      type: "active",
      tabId: tabIdRef.current,
      conversationId: document.hidden ? null : activeRef.current,
    } satisfies PresenceMessage);
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    tabIdRef.current = newTabId();
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
      const message = event.data;
      if (!message || message.tabId === tabIdRef.current) return;
      if (message.type === "bye") {
        peersRef.current.delete(message.tabId);
        return;
      }
      peersRef.current.set(message.tabId, {
        conversationId: message.conversationId,
        at: Date.now(),
      });
    };

    const heartbeat = setInterval(() => {
      const now = Date.now();
      for (const [tabId, peer] of peersRef.current) {
        if (now - peer.at > PRESENCE_STALE_MS) peersRef.current.delete(tabId);
      }
      announce();
    }, PRESENCE_HEARTBEAT_MS);

    const onVisibility = () => announce();
    document.addEventListener("visibilitychange", onVisibility);
    announce();

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        channel.postMessage({ type: "bye", tabId: tabIdRef.current } satisfies PresenceMessage);
      } catch {
        // Channel already closing on unload.
      }
      channel.close();
      channelRef.current = null;
      peersRef.current.clear();
    };
  }, [announce]);

  const setActiveConversation = useCallback(
    (id: string | null) => {
      activeRef.current = id;
      announce();
    },
    [announce],
  );

  // --- Counts + socket -----------------------------------------------------

  const refreshRef = useRef<() => void>(() => {});
  /** Refetches the bell's first page; set up by the reconcile effect below. */
  const reconcileRef = useRef<(options?: { force?: boolean }) => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let socket: Socket | undefined;
    let inFlight = false;
    let refreshAgain = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      if (inFlight) {
        refreshAgain = true;
        return;
      }
      inFlight = true;
      try {
        const response = await fetch("/api/unread-counts", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as UnreadPayload;
        if (disposed) return;
        setCounts((previous) =>
          previous.unread === data.unread && previous.unassignedUnread === data.unassignedUnread
            ? previous
            : { unread: data.unread, unassignedUnread: data.unassignedUnread },
        );
        const nextNotificationUnread =
          typeof data.notificationUnread === "number" ? data.notificationUnread : 0;
        setNotificationUnread(nextNotificationUnread);

        if (!socket && data.realtimeUrl) {
          socket = io(data.realtimeUrl, {
            auth: (cb) => {
              fetch("/api/ws-ticket", { method: "POST" })
                .then((r) => (r.ok ? r.json() : Promise.reject()))
                .then((ticket: { ticket: string }) => {
                  if (!disposed) cb({ token: ticket.ticket });
                })
                .catch(() => {
                  if (!disposed) cb({ token: "" });
                });
            },
            transports: ["websocket", "polling"],
          });
          socketRef.current = socket;
          socket.onAny((event: string, payload?: unknown) => {
            const handlers = socketHandlersRef.current.get(event);
            if (!handlers) return;
            for (const handler of [...handlers]) {
              try {
                handler(payload);
              } catch {
                // One subscriber's bug must not break the others.
              }
            }
          });
          socket.on("ready", (payload?: { kind?: string; agentStatus?: unknown }) => {
            // The stored status rides along with `ready`, so a reload or a
            // reconnect shows the truth instead of a guess.
            if (payload?.kind === "agent" && isAgentStatus(payload.agentStatus)) {
              setAgentStatusState(payload.agentStatus);
            }
            schedule();
            // A reconnect may have missed events; the bell must catch up.
            reconcileRef.current({ force: true });
          });
          // Other tabs of the same user share one status; follow their change.
          socket.on(
            "agent:status:changed",
            (payload?: { userId?: string; status?: unknown }) => {
              if (isAgentStatus(payload?.status)) setAgentStatusState(payload.status);
            },
          );
          socket.on("conversation:updated", schedule);
          socket.on("access:granted", schedule);
          socket.on("access:revoked", schedule);

          socket.on("notification:new", (view: NotificationView) => {
            if (!view || typeof view.id !== "string") return;
            // A replayed event must not add the row twice.
            if (!itemIdsRef.current.has(view.id)) {
              itemIdsRef.current.add(view.id);
              setItems((previous) => [view, ...previous].slice(0, 200));
            }
            // The badge and the title come from the server, so just ask for them.
            schedule();
            alert({
              key: `n:${view.id}`,
              title: view.title,
              body: view.body,
              conversationId: view.conversationId,
              ticketId: view.ticketId ?? null,
            });
          });

          socket.on("notification:message", (payload: NotificationMessageEvent) => {
            if (!payload || typeof payload.messageId !== "string") return;
            // A brand-new conversation sends both events for the same message;
            // sharing the bell's alert key makes whichever arrives first the
            // only one that rings.
            const key =
              typeof payload.notificationId === "string" && payload.notificationId
                ? `n:${payload.notificationId}`
                : `m:${payload.messageId}`;
            schedule();
            alert({
              key,
              title: `Tin nhắn mới · ${payload.visitorLabel}`,
              body: payload.preview ?? "",
              conversationId: payload.conversationId ?? null,
            });
          });

          socket.on("notification:read", (payload: NotificationReadEvent) => {
            if (!payload) return;
            if (payload.all) {
              const now = new Date().toISOString();
              setItems((previous) =>
                previous.map((item) => (item.readAt ? item : { ...item, readAt: now })),
              );
            } else if (typeof payload.id === "string") {
              const now = new Date().toISOString();
              setItems((previous) =>
                previous.map((item) =>
                  item.id === payload.id && !item.readAt ? { ...item, readAt: now } : item,
                ),
              );
            }
            if (typeof payload.unreadCount === "number") setUnreadCount(payload.unreadCount);
          });
        }
      } catch {
        // Keep the last known counts during transient outages.
      } finally {
        inFlight = false;
        if (refreshAgain && !disposed) {
          refreshAgain = false;
          schedule();
        }
      }
    };

    const schedule = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    refreshRef.current = schedule;

    const onVisible = () => {
      if (!document.hidden) schedule();
    };
    void refresh();
    const reconcileBell = () => reconcileRef.current();
    const fallback = setInterval(() => {
      schedule();
      reconcileBell();
    }, 15000);
    const onFocus = () => {
      schedule();
      reconcileBell();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      clearInterval(fallback);
      if (timer) clearTimeout(timer);
      socket?.close();
      socketRef.current = null;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // `alert` is stable apart from `router`, which never changes identity.
  }, [alert]);

  // --- Bell list -----------------------------------------------------------

  /**
   * Refetches the first page of the bell and merges anything new on top, so a
   * reconnect, a focus or the poll cannot leave the list behind the server.
   * Pages loaded further down are kept; the badge comes from the response.
   */
  const reconcile = useCallback(
    async (options: { force?: boolean; initial?: boolean; signal?: AbortSignal } = {}) => {
      if (reconcileInFlightRef.current) {
        // A forced pass (reconnect) must not be lost behind a running one.
        if (options.force) reconcilePendingRef.current = true;
        return;
      }
      const now = Date.now();
      // Except after a reconnect, a burst of triggers must not refetch in a loop.
      if (!options.force && now - lastReconcileRef.current < RECONCILE_MIN_MS) return;
      lastReconcileRef.current = now;
      reconcileInFlightRef.current = true;
      try {
        const response = await fetch(`/api/notifications?limit=${PAGE_SIZE}`, {
          cache: "no-store",
          signal: options.signal,
        });
        if (!response.ok) throw new Error("list");
        const data = (await response.json()) as {
          items?: NotificationView[];
          unreadCount?: number;
          nextCursor?: string | null;
        };
        const incoming = Array.isArray(data.items) ? data.items : [];
        setItems((previous) => {
          const known = new Set(previous.map((item) => item.id));
          const fresh = incoming.filter((item) => !known.has(item.id));
          if (!fresh.length) return previous;
          fresh.forEach((item) => itemIdsRef.current.add(item.id));
          return [...fresh, ...previous];
        });
        if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
        if (options.initial) {
          cursorRef.current = data.nextCursor ?? null;
          setHasMore(Boolean(data.nextCursor));
        }
        setError(false);
      } catch {
        if (!options.signal?.aborted) setError(true);
      } finally {
        reconcileInFlightRef.current = false;
        if (options.initial && !options.signal?.aborted) setLoading(false);
        if (reconcilePendingRef.current) {
          reconcilePendingRef.current = false;
          void reconcile({ force: true });
        }
      }
    },
    [],
  );

  useEffect(() => {
    reconcileRef.current = (options) => void reconcile(options);
    return () => {
      reconcileRef.current = () => {};
    };
  }, [reconcile]);

  useEffect(() => {
    const controller = new AbortController();
    void reconcile({ force: true, initial: true, signal: controller.signal });
    return () => controller.abort();
  }, [reconcile]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const response = await fetch(
        `/api/notifications?limit=${PAGE_SIZE}&before=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("list");
      const data = (await response.json()) as {
        items?: NotificationView[];
        nextCursor?: string | null;
      };
      const incoming = Array.isArray(data.items) ? data.items : [];
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.id));
        const added = incoming.filter((item) => !known.has(item.id));
        added.forEach((item) => itemIdsRef.current.add(item.id));
        return [...previous, ...added];
      });
      cursorRef.current = data.nextCursor ?? null;
      setHasMore(Boolean(data.nextCursor));
      setError(false);
    } catch {
      setError(true);
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    const readAt = new Date().toISOString();
    // Optimistic: the row looks read at once, the badge is the server's answer.
    setItems((previous) =>
      previous.map((item) =>
        item.id === id && !item.readAt ? { ...item, readAt } : item,
      ),
    );
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("read");
      const data = (await response.json()) as { ok?: boolean; unreadCount?: number };
      if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
    } catch {
      // Undo the optimistic row with the server's truth.
      void reconcile({ force: true });
    }
  }, [reconcile]);

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    setItems((previous) =>
      previous.map((item) => (item.readAt ? item : { ...item, readAt })),
    );
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!response.ok) throw new Error("read-all");
      const data = (await response.json()) as { ok?: boolean; unreadCount?: number };
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      void reconcile({ force: true });
    }
  }, [reconcile]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") unlockNotificationAudio();
    } catch {
      setPermission(readPermission());
    }
  }, []);

  // --- Agent availability (Online / Bận / Vắng) ----------------------------

  const setAgentStatus = useCallback(async (status: AgentStatus) => {
    const socket = socketRef.current;
    if (!socket?.connected || agentStatus === null) {
      setAgentStatusErrorState("Chưa kết nối máy chủ, thử lại sau.");
      return;
    }
    setAgentStatusPending(true);
    setAgentStatusErrorState(null);
    const ack = (await socket
      .timeout(8000)
      .emitWithAck("agent:status", { status })
      .catch(() => null)) as { ok?: boolean; status?: unknown; error?: string } | null;

    if (ack?.ok && isAgentStatus(ack.status)) {
      setAgentStatusState(ack.status);
      setAgentStatusErrorState(null);
    } else {
      // Keep the previous status; the server never applied this one.
      setAgentStatusErrorState(ack?.error ?? "Không đổi được trạng thái.");
    }
    setAgentStatusPending(false);
  }, [agentStatus]);

  // --- Tab title -----------------------------------------------------------

  useEffect(() => {
    baseTitleRef.current = document.title.replace(TITLE_PREFIX, "");
    const base = baseTitleRef.current;
    document.title = notificationUnread > 0 ? `(${notificationUnread}) ${base}` : base;
  }, [notificationUnread]);

  useEffect(() => {
    // Leaving the dashboard (logout, unmounting layout) must not leave "(3) " behind.
    return () => {
      document.title = document.title.replace(TITLE_PREFIX, "");
    };
  }, []);

  const value: NotificationsContextValue = {
    counts,
    items,
    unreadCount,
    hasMore,
    loading,
    error,
    loadMore,
    markRead,
    markAllRead,
    setActiveConversation,
    permission,
    requestPermission,
    agentStatus,
    agentStatusPending,
    agentStatusError,
    setAgentStatus,
    subscribeSocketEvent,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside <NotificationsProvider>.");
  }
  return context;
}

/** The agent's own availability, as the sidebar toggle reads and writes it. */
export function useAgentStatus() {
  const { agentStatus, agentStatusPending, agentStatusError, setAgentStatus } = useNotifications();
  return { agentStatus, agentStatusPending, agentStatusError, setAgentStatus };
}

/**
 * Runs `handler` for every `event` on the dashboard socket, across reconnects.
 * The latest handler is always called, so callers need not memoize it.
 */
export function useSocketEvent(event: string, handler: (payload: unknown) => void): void {
  const { subscribeSocketEvent } = useNotifications();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(
    () => subscribeSocketEvent(event, (payload) => handlerRef.current(payload)),
    [event, subscribeSocketEvent],
  );
}
