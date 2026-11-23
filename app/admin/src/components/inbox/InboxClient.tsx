"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronUp,
  Globe,
  Hand,
  Loader2,
  Lock,
  RotateCcw,
  Send,
  UserPlus,
  X,
  Search,
  MessageSquare,
  Sparkles,
  PanelRight,
  Copy,
  CheckCheck,
  Volume2,
  VolumeX,
  RefreshCw,
  MessageCircle,
  ArrowLeft,
  Smile,
  SmilePlus,
  Check,
  Plus,
  ChevronDown,
  Inbox,
  Bold,
  Italic,
  Code,
  Quote,
} from "lucide-react";
import type {
  ChatMessage,
  Conversation,
  ConversationCounts,
  InboxFilter,
  MessageReaction,
  ProjectRef,
} from "@/lib/chat";
import {
  INBOX_FILTERS,
  filterToQuery,
  matchesFilter,
  summarizeReactions,
  joinNames,
  visitorLabel,
} from "@/lib/chat";
import { InternalNotes } from "./InternalNotes";
import { type AccountPreferences, announcePreferences } from "./preferences";
import { getChatTheme, type ChatTheme } from "./chatThemes";
import {
  DEFAULT_CANNED_TEMPLATES,
  cannedGroups,
  findSlashQuery,
  insertCannedText,
  resolvePersonalTemplates,
  searchCanned,
  type CannedHit,
  type CannedTemplate,
  type SlashQuery,
} from "@/lib/canned";
import { CannedPickerPanel, CannedSuggestions, useEffectiveCanned } from "./CannedPicker";
import { EmojiPickerPanel, EmojiPopover, QUICK_REACTIONS } from "./EmojiPicker";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import {
  AttachButton,
  AttachmentTray,
  MessageAttachments,
  handleImagePaste,
  useAttachmentUploads,
  useImageDrop,
} from "@/components/attachments";
import { ATTACHMENT_ERRORS } from "@/lib/attachments";

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

type InitialThread = {
  conversation: Conversation;
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
};

interface InboxClientProps {
  initialThread?: InitialThread | null;
  initial: {
    conversations: Conversation[];
    counts: ConversationCounts;
    hasMore: boolean;
    nextCursor: string | null;
    projects: ProjectRef[];
  };
  initialFilter: InboxFilter;
  currentUser: CurrentUser;
  apiOrigin: string;
}

type MemberView = { userId: string; name: string; email: string | null; role: string };

const TYPING_THROTTLE_MS = 1200;
const TYPING_IDLE_MS = 2000;
const COUNTS_REFRESH_DEBOUNCE_MS = 2500;

/** The composer's first row: the glyphs agents actually insert, not reactions. */
const QUICK_EMOJIS = ["👍", "🙏", "😊", "❤️", "👋", "✨", "🎉", "⏳"];

// Modern B2B SaaS Avatar Color Tokens (Subtle pastel surfaces with high-contrast text)
const AVATAR_PALETTES = [
  { bg: "bg-amber-100 text-amber-800 border-amber-200/80" },
  { bg: "bg-indigo-100 text-indigo-700 border-indigo-200/80" },
  { bg: "bg-purple-100 text-purple-700 border-purple-200/80" },
  { bg: "bg-emerald-100 text-emerald-700 border-emerald-200/80" },
  { bg: "bg-amber-100 text-amber-800 border-amber-200/80" },
  { bg: "bg-rose-100 text-rose-700 border-rose-200/80" },
  { bg: "bg-teal-100 text-teal-700 border-teal-200/80" },
  { bg: "bg-slate-100 text-slate-700 border-slate-300" },
];

function getAvatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return "KH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes}p`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function formatFullDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function sortByActivity(list: Conversation[]): Conversation[] {
  return [...list].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

export function InboxClient({
  initial,
  initialFilter,
  initialThread,
  currentUser,
  apiOrigin,
}: InboxClientProps) {
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [conversations, setConversations] = useState(() => sortByActivity(initial.conversations));
  const [counts, setCounts] = useState(initial.counts);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [projects, setProjects] = useState(initial.projects);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThread?.conversation.id ?? initial.conversations[0]?.id ?? null,
  );
  const [loadingList, setLoadingList] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef("");
  const listRequestVersion = useRef(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [personalTemplates, setPersonalTemplates] = useState<CannedTemplate[]>(
    DEFAULT_CANNED_TEMPLATES,
  );
  const preferencesRef = useRef<AccountPreferences | null>(null);
  const [savingSound, setSavingSound] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const theme = getChatTheme("front-amber");
  const { setActiveConversation } = useNotifications();

  useEffect(() => {
    const controller = new AbortController();
    const apply = (preferences: AccountPreferences) => {
      preferencesRef.current = preferences;
      setSoundEnabled(preferences.soundEnabled ?? true);
      setPersonalTemplates(resolvePersonalTemplates(preferences));
    };
    const listener = (event: Event) => {
      controller.abort();
      apply((event as CustomEvent<AccountPreferences>).detail);
    };
    window.addEventListener("account-preferences", listener);
    fetch("/api/account/preferences", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("preferences");
      apply(await response.json());
    }).catch(() => {});
    return () => { controller.abort(); window.removeEventListener("account-preferences", listener); };
  }, []);

  async function toggleSound() {
    if (savingSound) return;
    setSavingSound(true);
    try {
      let current = preferencesRef.current;
      if (!current) {
        const response = await fetch("/api/account/preferences");
        if (!response.ok) throw new Error("preferences");
        current = await response.json() as AccountPreferences;
      }
      const response = await fetch("/api/account/preferences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soundEnabled: !soundEnabled }),
      });
      if (!response.ok) throw new Error("save");
      const saved = (await response.json()) as AccountPreferences;
      preferencesRef.current = saved;
      setSoundEnabled(saved.soundEnabled ?? !soundEnabled);
      // The provider plays the chime: it must see the toggle before the next message.
      announcePreferences(saved);
    } catch { setError("Không lưu được tùy chọn âm thanh."); }
    finally { setSavingSound(false); }
  }

  const socketRef = useRef<Socket | null>(null);
  const selectedIdRef = useRef(selectedId);
  const filterRef = useRef(filter);
  const seenUnread = useRef(
    new Map(initial.conversations.map((item) => [item.id, item.unreadForAgent ?? 0])),
  );
  const countsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read outside state updaters, where a side effect would run twice.
  const conversationIds = useRef(
    new Set(initial.conversations.map((conversation) => conversation.id)),
  );

  useEffect(() => {
    conversationIds.current = new Set(conversations.map((conversation) => conversation.id));
  }, [conversations]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const totalUnread = conversations.reduce(
    (sum, conversation) => sum + (conversation.unreadForAgent ?? 0),
    0,
  );

  // The dashboard provider owns the tab title; this page only keeps the
  // in-page "N tin mới" chip derived from the loaded list.

  const refreshCounts = useCallback(() => {
    if (countsTimer.current) return;

    countsTimer.current = setTimeout(() => {
      countsTimer.current = null;

      fetch("/api/conversations?limit=1")
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("counts"))))
        .then((data: { counts: ConversationCounts; projects: ProjectRef[] }) => {
          setCounts(data.counts);
          setProjects(data.projects);
        })
        .catch(() => {});
    }, COUNTS_REFRESH_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (countsTimer.current) clearTimeout(countsTimer.current);
    },
    [],
  );

  const loadList = useCallback(
    async (next: InboxFilter, options: { before?: string } = {}) => {
      const version = ++listRequestVersion.current;
      setLoadingList(true);
      const query = new URLSearchParams(filterToQuery(next));
      if (searchRef.current.trim()) query.set("search", searchRef.current.trim());

      if (options.before) {
        query.set("before", options.before);
      }

      try {
        const response = await fetch(`/api/conversations?${query.toString()}`);
        if (!response.ok) throw new Error("list");

        const data = (await response.json()) as {
          conversations: Conversation[];
          counts: ConversationCounts;
          hasMore: boolean;
          nextCursor: string | null;
          projects: ProjectRef[];
        };

        if (version !== listRequestVersion.current) return;
        setConversations((previous) =>
          options.before
            ? sortByActivity([
                ...previous,
                ...data.conversations.filter(
                  (incoming) => !previous.some((existing) => existing.id === incoming.id),
                ),
              ])
            : sortByActivity(data.conversations),
        );
        setCounts(data.counts);
        setProjects(data.projects);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
        setError(null);
      } catch {
        if (version === listRequestVersion.current) setError("Không tải được danh sách hội thoại.");
      } finally {
        if (version === listRequestVersion.current) setLoadingList(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => void loadList(filterRef.current), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, loadList]);

  const changeFilter = (next: InboxFilter) => {
    if (next === filter) return;

    setFilter(next);
    setSelectedId(null);
    setMobileShowChat(false);

    const url = new URL(window.location.href);
    url.searchParams.set("filter", next);
    url.searchParams.delete("conversation");
    window.history.replaceState(null, "", url);

    void loadList(next);
  };

  // Re-announcing the join is how the server marks the visible thread read.
  // Each conversation keeps its own cooldown, and a request that arrives while
  // one is in flight or cooling down is remembered and sent once more after it,
  // so the thread the agent is looking at always ends up read.
  const JOIN_COOLDOWN_MS = 1000;
  const joinStates = useRef(
    new Map<string, { pending: boolean; timer: ReturnType<typeof setTimeout> | null }>(),
  );
  const joinAgain = useCallback((conversationId: string) => {
    const socket = socketRef.current;
    if (!socket) return;

    const existing = joinStates.current.get(conversationId);
    if (existing) {
      existing.pending = true;
      return;
    }

    const state: { pending: boolean; timer: ReturnType<typeof setTimeout> | null } = {
      pending: false,
      timer: null,
    };
    joinStates.current.set(conversationId, state);

    const send = () => {
      socket.emit("conversation:join", { conversationId });
      state.timer = setTimeout(() => {
        state.timer = null;
        if (!state.pending) {
          joinStates.current.delete(conversationId);
          return;
        }
        state.pending = false;
        send();
      }, JOIN_COOLDOWN_MS);
    };

    send();
  }, []);

  useEffect(() => {
    const states = joinStates.current;
    return () => {
      for (const state of states.values()) {
        if (state.timer) clearTimeout(state.timer);
      }
      states.clear();
    };
  }, []);

  useEffect(() => {
    const socket = io(apiOrigin, {
      auth: (cb) => {
        fetch("/api/ws-ticket", { method: "POST" })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error("ticket"))))
          .then((data: { ticket: string }) => cb({ token: data.ticket }))
          .catch(() => cb({ token: "" }));
      },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("ready", () => {
      void loadList(filterRef.current);
      setConnected(true);
      setError(null);
    });

    const markOffline = () => setConnected(false);
    socket.on("disconnect", markOffline);
    socket.on("connect_error", markOffline);
    socket.on("error:auth", () => {
      markOffline();
      setError("Phiên làm việc không hợp lệ. Hãy tải lại trang.");
    });

    socket.on("conversation:updated", (incoming: Conversation) => {
      const unread = incoming.unreadForAgent ?? 0;
      const previousUnread = seenUnread.current.get(incoming.id) ?? 0;
      seenUnread.current.set(incoming.id, unread);
      // Sound/desktop alerts live in the dashboard provider now. What stays
      // here is the open-thread fix: a message read in the visible thread must
      // be marked read on the server again, or unreadForAgent stays > 0.
      if (
        unread > 0 &&
        unread > previousUnread &&
        incoming.id === selectedIdRef.current &&
        !document.hidden
      ) {
        joinAgain(incoming.id);
      }
      if (searchRef.current.trim()) {
        void loadList(filterRef.current);
        refreshCounts();
        return;
      }
      setConversations((previous) => {
        const existing = previous.find((conversation) => conversation.id === incoming.id);
        const merged = { ...existing, ...incoming } as Conversation;
        const rest = previous.filter((conversation) => conversation.id !== incoming.id);

        if (!matchesFilter(merged, filterRef.current, currentUser.id)) {
          return rest;
        }

        return sortByActivity([merged, ...rest]);
      });

      refreshCounts();
    });

    socket.on("access:granted", () => void loadList(filterRef.current));

    socket.on("access:revoked", ({ siteId }: { siteId: string }) => {
      setConversations((previous) =>
        previous.filter((conversation) => conversation.siteId !== siteId),
      );
      setProjects((previous) => previous.filter((project) => project.id !== siteId));
      setNotice("Bạn vừa bị thu hồi quyền ở một dự án, các hội thoại của dự án đó đã được ẩn.");
      refreshCounts();
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [apiOrigin, currentUser.id, refreshCounts, loadList, joinAgain]);

  // A notification can point at a conversation outside the loaded page/filter,
  // so fetch its thread before selecting it.
  const ensureConversation = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(id)}/messages`,
        { cache: "no-store" },
      );
      if (!response.ok) return false;
      const data = (await response.json()) as { conversation?: Conversation };
      if (!data.conversation) return false;
      const conversation = data.conversation;
      setConversations((previous) =>
        sortByActivity([conversation, ...previous.filter((item) => item.id !== id)]),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const selectConversation = useCallback(
    (id: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set("conversation", id);
      window.history.replaceState(null, "", url);
      setSelectedId(id);
      setMobileShowChat(true);
      // Not in the loaded page/filter: pull it in so the panel can render it.
      if (!conversationIds.current.has(id)) void ensureConversation(id);
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === id ? { ...conversation, unreadForAgent: 0 } : conversation,
        ),
      );
    },
    [ensureConversation],
  );

  // The bell/provider dispatches this before navigating, because Next does not
  // remount the inbox when only the query string changes.
  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (typeof id === "string" && id) selectConversation(id);
    };
    window.addEventListener("inbox:open-conversation", listener);
    return () => window.removeEventListener("inbox:open-conversation", listener);
  }, [selectConversation]);

  // Back/forward and `router.push` change only the query string, so no remount
  // happens; follow the param whenever it names a different thread. The
  // `replaceState` writes above do not change `searchParams`, and the ref is
  // already updated by then, so this cannot bounce back and forth.
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  useEffect(() => {
    if (!conversationParam) return;
    if (conversationParam === selectedIdRef.current) return;
    selectConversation(conversationParam);
  }, [conversationParam, selectConversation]);

  // Lets the provider suppress alerts for the thread this tab is showing.
  useEffect(() => {
    setActiveConversation(selectedId);
    return () => setActiveConversation(null);
  }, [selectedId, setActiveConversation]);

  // Coming back to the tab re-marks the open thread read, matching the server's
  // own read-on-join behaviour.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && selectedIdRef.current) joinAgain(selectedIdRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [joinAgain]);

  const runAction = async (
    conversationId: string,
    action: "claim" | "release" | "close" | "reopen" | "assign",
    agentId?: string,
  ) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(agentId ? { agentId } : {}) }),
      });

      const data = (await response.json()) as { conversation?: Conversation; error?: string };

      if (!response.ok || !data.conversation) {
        setError(data.error ?? "Không thực hiện được hành động này.");
        return;
      }

      const updated = data.conversation;

      setConversations((previous) => {
        const rest = previous.filter((conversation) => conversation.id !== updated.id);

        if (!matchesFilter(updated, filterRef.current, currentUser.id)) {
          if (selectedIdRef.current === updated.id) {
            setSelectedId(null);
            setMobileShowChat(false);
          }
          return rest;
        }

        return sortByActivity([updated, ...rest]);
      });

      setError(null);
      refreshCounts();
    } catch {
      setError("Không kết nối được tới máy chủ.");
    }
  };

  const countFor = (key: InboxFilter): number | null => {
    switch (key) {
      case "mine":
        return counts.mine;
      case "unassigned":
        return counts.unassigned;
      case "closed":
        return counts.closed;
      default:
        return counts.open + counts.closed;
    }
  };

  const filteredConversations = conversations;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8F9FA]">
      {/* 1. SaaS Workstation Header */}
      <header className="h-14 shrink-0 bg-white border-b border-neutral-200/80 px-4 sm:px-6 flex items-center justify-between gap-3 shadow-2xs z-10">
        {/* Left: Brand Icon & Segmented Filter Control */}
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-none py-1">
          <div className="flex items-center gap-2 pr-2 border-r border-neutral-200 hidden sm:flex">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shadow-2xs ${theme.uiAccent.brandBadge}`}>
              <Inbox className="w-4 h-4" />
            </div>
            <div className="font-semibold text-xs text-neutral-900 whitespace-nowrap">
              Hộp thư hỗ trợ
            </div>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200/60 shadow-2xs">
            {INBOX_FILTERS.map(({ key, label }) => {
              const count = countFor(key);
              const active = key === filter;
              const isUnassigned = key === "unassigned";

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeFilter(key)}
                  aria-current={active}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer select-none whitespace-nowrap ${
                    active
                      ? "bg-white text-neutral-900 shadow-xs font-semibold"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60"
                  }`}
                >
                  <span>{label}</span>
                  {count !== null && count > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums leading-none ${
                        isUnassigned && count > 0
                          ? active
                            ? "bg-amber-100 text-amber-900 font-bold"
                            : "bg-amber-100/90 text-amber-800"
                          : active
                            ? "bg-neutral-900 text-white"
                            : "bg-neutral-200/80 text-neutral-600"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {totalUnread > 0 && (
            <span className={`hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border shadow-2xs ${theme.uiAccent.brandBadge}`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${theme.uiAccent.activeDot}`} />
              <span>{totalUnread} tin mới</span>
            </span>
          )}
        </div>

        {/* Right: SaaS Status Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sound Toggle */}
          <button
            type="button"
            disabled={savingSound}
            onClick={() => void toggleSound()}
            title={soundEnabled ? "Tắt âm thông báo" : "Bật âm thông báo"}
            className={`p-1.5 rounded-lg border text-xs transition cursor-pointer shadow-2xs ${
              soundEnabled
                ? "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                : "bg-neutral-100 border-neutral-200 text-neutral-400"
            }`}
          >
            {soundEnabled ? (
              <Volume2 className={`w-3.5 h-3.5 ${theme.uiAccent.icon}`} />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Realtime Status Indicator */}
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border shadow-2xs ${
              connected
                ? "bg-emerald-50 text-emerald-800 border-emerald-200/80"
                : "bg-amber-50 text-amber-800 border-amber-200/80"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-emerald-500 animate-pulse ring-2 ring-emerald-200" : "bg-amber-500"
              }`}
            />
            <span className="hidden md:inline">{connected ? "Realtime" : "Đang kết nối lại…"}</span>
          </div>

          {/* Refresh Action */}
          <button
            type="button"
            onClick={() => void loadList(filter)}
            disabled={loadingList}
            title="Làm mới danh sách hội thoại"
            className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingList ? `animate-spin ${theme.uiAccent.icon}` : ""}`}
            />
          </button>
        </div>
      </header>

      {/* Global Alerts */}
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 text-xs text-rose-800 px-4 py-2 flex items-center justify-between gap-3 animate-in fade-in">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-800 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {notice && (
        <div className="bg-amber-50 border-b border-amber-200 text-xs text-amber-900 px-4 py-2 flex items-center justify-between gap-3 animate-in fade-in">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-amber-600 hover:text-amber-900 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Main SaaS 3-Column Workstation */}
      <div className="flex-1 flex min-h-0 divide-x divide-neutral-200/80 overflow-hidden">
        {/* Left Column: Triage Queue */}
        <aside
          className={`w-full md:w-[320px] lg:w-[340px] xl:w-[360px] min-h-0 shrink-0 flex flex-col bg-white ${
            mobileShowChat ? "hidden md:flex" : "flex"
          }`}
        >
          {/* SaaS Search Bar */}
          <div className="p-3 border-b border-neutral-100 bg-neutral-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
              <input
                value={searchQuery}
                maxLength={100}
                onChange={(e) => {
                  searchRef.current = e.target.value;
                  listRequestVersion.current++;
                  setSearchQuery(e.target.value);
                }}
                placeholder="Tìm tên, email, mã hoặc tin gần nhất…"
                className={`w-full pl-8 pr-12 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs text-neutral-900 placeholder:text-neutral-400 outline-none transition shadow-2xs ${theme.uiAccent.focusRing}`}
              />
              <div className="absolute right-2 top-2 flex items-center gap-1">
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => { searchRef.current = ""; listRequestVersion.current++; setSearchQuery(""); }}
                    className="text-neutral-400 hover:text-neutral-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block text-[10px] bg-neutral-100 border border-neutral-200 text-neutral-400 px-1 py-0.5 rounded font-mono shadow-2xs">
                    /
                  </kbd>
                )}
              </div>
            </div>
            {searchQuery && (
              <div className="text-[11px] text-neutral-500 mt-1.5 px-0.5">
                Tìm thấy {filteredConversations.length} hội thoại phù hợp
              </div>
            )}
          </div>

          {/* Conversation List */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-neutral-100/90">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-3 border border-neutral-200/60 shadow-2xs">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-neutral-900">
                  {loadingList
                    ? "Đang tải hội thoại…"
                    : searchQuery
                      ? "Không có kết quả phù hợp"
                      : filter === "all"
                        ? "Chưa có cuộc trò chuyện nào"
                        : "Không có hội thoại trong mục này"}
                </p>
                <p className="text-[11px] text-neutral-500 mt-1 max-w-[220px] mx-auto leading-relaxed">
                  {searchQuery
                    ? "Hãy kiểm tra lại từ khóa hoặc xóa bộ lọc tìm kiếm."
                    : "Khi khách hàng gửi tin nhắn từ Web Widget, hội thoại sẽ xuất hiện ngay tại đây."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {filteredConversations.map((conversation) => {
                  const isActive = conversation.id === selectedId;
                  const mine = conversation.assignedAgentId === currentUser.id;
                  const label = visitorLabel(conversation);
                  const initials = getInitials(label);
                  const palette = getAvatarPalette(label);

                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => selectConversation(conversation.id)}
                        aria-current={isActive}
                        className={`w-full text-left p-3 sm:px-3.5 transition-colors cursor-pointer flex items-start gap-3 border-l-3 ${
                          isActive
                            ? theme.uiAccent.activeItem
                            : "border-l-transparent hover:bg-neutral-50/80"
                        }`}
                      >
                        {/* SaaS Pastel Avatar */}
                        <div
                          className={`w-9 h-9 rounded-xl ${palette.bg} border flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs relative`}
                        >
                          {initials}
                          {conversation.unreadForAgent > 0 && (
                            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${theme.uiAccent.activeDot}`} />
                          )}
                        </div>

                        {/* Summary Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span
                              className={`text-xs truncate ${
                                conversation.unreadForAgent > 0
                                  ? "font-bold text-neutral-900"
                                  : "font-semibold text-neutral-800"
                              }`}
                            >
                              {label}
                            </span>
                            <span className="text-[10px] text-neutral-400 shrink-0 font-medium tabular-nums">
                              {formatRelative(conversation.lastMessageAt)}
                            </span>
                          </div>

                          <p
                            className={`text-[11px] truncate mb-1.5 leading-snug ${
                              conversation.unreadForAgent > 0
                                ? "font-semibold text-neutral-900"
                                : "text-neutral-500"
                            }`}
                          >
                            {conversation.lastMessagePreview ?? "Chưa có tin nhắn"}
                          </p>

                          {/* Metadata Tags */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {conversation.siteName && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-neutral-600 bg-neutral-100 border border-neutral-200/60 px-1.5 py-0.5 rounded shadow-2xs">
                                <Globe className="w-2.5 h-2.5 text-neutral-400" />
                                <span className="truncate max-w-[85px]">
                                  {conversation.siteName}
                                </span>
                              </span>
                            )}

                            {conversation.status === "closed" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200/60">
                                <Lock className="w-2.5 h-2.5" />
                                Đã đóng
                              </span>
                            ) : conversation.assignedAgentId ? (
                              <span
                                className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                                  mine
                                    ? theme.uiAccent.assignedMine
                                    : "bg-neutral-100 text-neutral-700 border-neutral-200/60"
                                }`}
                              >
                                {mine ? "Bạn phụ trách" : (conversation.assignedAgentName ?? "Đã nhận")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Chờ nhận
                              </span>
                            )}

                            {conversation.unreadForAgent > 0 && (
                              <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 tabular-nums shadow-2xs ${theme.uiAccent.unreadBadge}`}>
                                {conversation.unreadForAgent}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasMore && (
              <div className="p-3">
                <button
                  type="button"
                  disabled={loadingList}
                  onClick={() =>
                    void loadList(filter, {
                      before: nextCursor ?? undefined,
                    })
                  }
                  className="w-full py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition cursor-pointer shadow-2xs"
                >
                  {loadingList ? "Đang tải…" : "Tải thêm hội thoại cũ"}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Center Column: Active Conversation Stage */}
        <section
          className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white ${
            !mobileShowChat ? "hidden md:flex" : "flex"
          }`}
        >
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F8F9FA]">
              <div className="w-14 h-14 rounded-2xl bg-white border border-neutral-200 text-neutral-400 flex items-center justify-center mb-3 shadow-xs">
                <MessageCircle className="w-7 h-7 text-neutral-400" />
              </div>
              <h2 className="text-sm font-semibold text-neutral-900">Chưa chọn cuộc trò chuyện</h2>
              <p className="text-xs text-neutral-500 mt-1 max-w-xs leading-relaxed">
                Chọn một hội thoại từ danh sách bên trái để xem nội dung và bắt đầu tương tác với khách hàng.
              </p>
            </div>
          ) : (
            <ConversationThread
              personalTemplates={personalTemplates}
              siteName={projects.find((project) => project.id === selected.siteId)?.name}
              key={selected.id}
              conversation={selected}
              initialThread={initialThread?.conversation.id === selected.id ? initialThread : null}
              isProjectOwner={
                projects.find((project) => project.id === selected.siteId)?.access === "owner"
              }
              currentUser={currentUser}
              socketRef={socketRef}
              connected={connected}
              showRightSidebar={showRightSidebar}
              onToggleRightSidebar={() => setShowRightSidebar(!showRightSidebar)}
              onBackMobile={() => setMobileShowChat(false)}
              onError={setError}
              onAction={runAction}
              currentTheme={theme}
            />
          )}
        </section>

        {/* Right Column: Customer & Context Inspector */}
        {selected && showRightSidebar && (
          <aside className="w-72 lg:w-80 shrink-0 bg-white flex flex-col min-h-0 hidden lg:flex">
            <CustomerInspector
              conversation={selected}
              currentUser={currentUser}
              onClose={() => setShowRightSidebar(false)}
              onAction={runAction}
              currentTheme={theme}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

interface ConversationThreadProps {
  personalTemplates: CannedTemplate[];
  siteName?: string;
  initialThread?: InitialThread | null;
  conversation: Conversation;
  isProjectOwner: boolean;
  currentUser: CurrentUser;
  socketRef: RefObject<Socket | null>;
  connected: boolean;
  showRightSidebar: boolean;
  onToggleRightSidebar: () => void;
  onBackMobile: () => void;
  onError: (message: string | null) => void;
  onAction: (
    conversationId: string,
    action: "claim" | "release" | "close" | "reopen" | "assign",
    agentId?: string,
  ) => Promise<void>;
  currentTheme: ChatTheme;
}

function formatDateDivider(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return `Hôm nay, ${d.toLocaleDateString("vi-VN", { day: "numeric", month: "long" })}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Hôm qua, ${d.toLocaleDateString("vi-VN", { day: "numeric", month: "long" })}`;
    }
    return d.toLocaleDateString("vi-VN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function ConversationThread({
  personalTemplates,
  siteName,
  conversation,
  initialThread,
  isProjectOwner,
  currentUser,
  socketRef,
  connected,
  showRightSidebar,
  onToggleRightSidebar,
  onBackMobile,
  onError,
  onAction,
  currentTheme,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialThread?.messages ?? []);
  const [historyCursor, setHistoryCursor] = useState<string | null>(
    initialThread?.nextCursor ?? null,
  );
  const [hasOlder, setHasOlder] = useState(initialThread?.hasMore ?? false);
  const [loading, setLoading] = useState(!initialThread);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [visitorTyping, setVisitorTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showCannedMenu, setShowCannedMenu] = useState(false);
  const [slash, setSlash] = useState<SlashQuery | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  /** Which message's reaction popover is open, and where its "+" sits. */
  const [reactionPickerFor, setReactionPickerFor] = useState<{
    id: string;
    rect: { left: number; top: number; bottom: number; width: number };
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /**
   * Which message has its quick-reaction strip open. `below` flips it under
   * the button when there is no room above, e.g. on the first message.
   */
  const [quickReactFor, setQuickReactFor] = useState<{ id: string; below: boolean } | null>(null);

  const cannedMenuRef = useRef<HTMLDivElement | null>(null);
  const cannedPanelRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  /** The panel itself lives outside the button, so both count as "inside". */
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  /** How tall the emoji panel may be before it runs past the top of the screen. */
  const [emojiPanelMaxHeight, setEmojiPanelMaxHeight] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSentAt = useRef(0);
  const typingIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickToBottom = useRef(true);
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!quickReactFor) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-quick-react]")) return;
      setQuickReactFor(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickReactFor(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [quickReactFor]);
  /**
   * True while history is being re-read after a reconnect. A reaction that
   * arrives meanwhile is newer than the page being fetched, so it is held back
   * and replayed once that page has been merged.
   */
  const recovering = useRef(false);
  const bufferedReactions = useRef(new Map<string, MessageReaction[]>());
  /** Identifies the current recovery pass, so a stale one cannot end it. */
  const recoverRun = useRef(0);

  const conversationId = conversation.id;
  const closed = conversation.status === "closed";
  const mine = conversation.assignedAgentId === currentUser.id;
  const label = visitorLabel(conversation);
  const initials = getInitials(label);
  const palette = getAvatarPalette(label);

  /** Agent names seen in this thread, so a colleague's reaction can be named. */
  const agentNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const message of messages) {
      const name = message.sender?.name ?? message.senderName;
      if (message.senderKind === "agent" && message.senderId && name) {
        names.set(message.senderId, name);
      }
    }
    return names;
  }, [messages]);
  const reactorName = useCallback(
    (reaction: { kind: "visitor" | "agent"; id: string }) =>
      reaction.kind === "visitor" ? label : (agentNames.get(reaction.id) ?? "Nhân viên khác"),
    [agentNames, label],
  );

  // The project's own set and the shared set, already narrowed by the mode the
  // project chose. Null until loaded (or if the call failed), in which case the
  // picker still offers the agent's own replies.
  const effective = useEffectiveCanned(conversation.siteId);

  // Image uploads for the composer. The thread is keyed by conversation id, so
  // switching conversation remounts it; the clear() below also covers a reused
  // instance.
  const uploads = useAttachmentUploads(conversation.siteId);
  const { clear: clearUploads } = uploads;
  useEffect(() => clearUploads, [conversationId, clearUploads]);
  const { isDragging, dropProps } = useImageDrop(uploads.addFiles, { disabled: !connected });
  // The tray stays filled while the ack is pending, so a second Enter must not
  // resend the same (already claimed) images.
  const sendingRef = useRef(false);

  const groups = useMemo(
    () => cannedGroups({ personal: personalTemplates, effective, siteName }),
    [personalTemplates, effective, siteName],
  );
  const slashHits = useMemo<CannedHit[]>(
    () => (slash ? searchCanned(groups, slash.query).slice(0, 8) : []),
    [slash, groups],
  );
  const totalCannedCount = useMemo(
    () => groups.reduce((acc, g) => acc + g.templates.length, 0),
    [groups],
  );

  useEffect(() => {
    let cancelled = false;
    if (initialThread) return;

    fetch(`/api/conversations/${conversationId}/messages`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("load"))))
      .then(
        (data: {
          messages: ChatMessage[];
          hasMore: boolean;
          nextCursor: string | null;
        }) => {
          if (!cancelled) {
            setMessages(data.messages);
            setHasOlder(data.hasMore);
            setHistoryCursor(data.nextCursor);
          }
        },
      )
      .catch(() => {
        if (!cancelled) onError("Không tải được nội dung hội thoại.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, onError, initialThread]);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;

    setLoadingOlder(true);
    stickToBottom.current = false;

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(
          historyCursor ?? oldest.createdAt,
        )}`,
      );
      if (!response.ok) throw new Error("older");

      const data = (await response.json()) as {
        messages: ChatMessage[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      setMessages((previous) => [
        ...data.messages.filter(
          (incoming) => !previous.some((existing) => existing.id === incoming.id),
        ),
        ...previous,
      ]);
      setHasOlder(data.hasMore);
      setHistoryCursor(data.nextCursor);
    } catch {
      onError("Không tải được tin nhắn cũ hơn.");
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const join = () => {
      socket.emit("conversation:join", { conversationId });
    };

    const onMessage = (message: ChatMessage) => {
      if (message.conversationId !== conversationId) return;
      stickToBottom.current = true;
      setMessages((previous) =>
        previous.some((existing) => existing.id === message.id) ? previous : [...previous, message],
      );
      if (message.senderKind === "visitor") {
        setVisitorTyping(false);
      }
    };

    const onTyping = (payload: { conversationId: string; from: string; isTyping: boolean }) => {
      if (payload.from === "visitor" && payload.conversationId === conversationId) {
        setVisitorTyping(payload.isTyping);
      }
    };

    const onReactions = (payload: {
      messageId?: string;
      conversationId?: string;
      reactions?: MessageReaction[];
    }) => {
      if (!payload || payload.conversationId !== conversationId || typeof payload.messageId !== "string") {
        return;
      }

      applyMessageReactions(payload.messageId, Array.isArray(payload.reactions) ? payload.reactions : []);
    };

    socket.on("message:new", onMessage);
    socket.on("message:reactions", onReactions);
    socket.on("typing", onTyping);
    socket.on("ready", join);
    join();

    return () => {
      socket.off("message:new", onMessage);
      socket.off("message:reactions", onReactions);
      socket.off("typing", onTyping);
      socket.off("ready", join);
      socket.emit("conversation:leave", { conversationId });
    };
  }, [conversationId, socketRef, connected]);

  // Socket.IO does not replay events missed while offline. Read persisted history
  // until reaching a known message, including gaps larger than a single page.
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const known = new Set(messagesRef.current.map((message) => message.id));
    // A reconnect can start a new pass before the previous one is done. Only the
    // newest pass may close recovery, or it would be switched off under itself.
    const run = ++recoverRun.current;
    recovering.current = true;
    async function recoverHistory() {
      let before: string | null = null;
      const recovered: ChatMessage[] = [];
      try {
        do {
          const response = await fetch(`/api/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal: controller.signal });
          if (!response.ok) throw new Error("history");
          const page = await response.json() as { messages: ChatMessage[]; hasMore: boolean; nextCursor: string | null };
          recovered.push(...page.messages);
          if (!known.size || page.messages.some((message) => known.has(message.id)) || !page.hasMore || !page.nextCursor || page.nextCursor === before) break;
          before = page.nextCursor;
        } while (!controller.signal.aborted);
        if (controller.signal.aborted) return;
        // Take the buffer and leave recovery mode before touching state: from
        // here on, anything that arrives applies straight to the messages, and
        // React replays those updaters after this merge.
        const owns = recoverRun.current === run;
        const newer = new Map(bufferedReactions.current);
        if (owns) {
          bufferedReactions.current.clear();
          recovering.current = false;
        }
        setMessages((previous) => {
          const merged = new Map(previous.map((message) => [message.id, message]));
          recovered.forEach((message) => merged.set(message.id, message));
          // A reaction seen during the fetch is newer than the page, so it wins.
          newer.forEach((reactions, messageId) => {
            const message = merged.get(messageId);
            if (message) merged.set(messageId, { ...message, reactions });
          });
          return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        });
      } catch {
        if (controller.signal.aborted) return;
        // The snapshot is lost, but what was seen live is still good.
        const owns = recoverRun.current === run;
        const newer = new Map(bufferedReactions.current);
        if (owns) {
          bufferedReactions.current.clear();
          recovering.current = false;
        }
        onError("Không tải bù được tin nhắn sau kết nối lại. Hãy tải lại hội thoại.");
        if (newer.size > 0) {
          setMessages((previous) =>
            previous.map((message) =>
              newer.has(message.id) ? { ...message, reactions: newer.get(message.id) ?? message.reactions } : message,
            ),
          );
        }
      }
    }
    void recoverHistory();
    return () => controller.abort();
  }, [connected, conversationId, onError]);

  useEffect(() => {
    if (stickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages, visitorTyping]);

  useEffect(
    () => () => {
      if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
    },
    [],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        cannedMenuRef.current &&
        !cannedMenuRef.current.contains(target) &&
        cannedPanelRef.current &&
        !cannedPanelRef.current.contains(target)
      ) {
        setShowCannedMenu(false);
      }
      const insideEmoji =
        (emojiPickerRef.current?.contains(target) ?? false) ||
        (emojiPanelRef.current?.contains(target) ?? false);
      if (!insideEmoji) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showEmojiPicker) return;

    // The panel opens upward from the composer, so the ceiling is the composer's
    // top edge: on a short window it has to shrink instead of being cut off.
    const measure = () => {
      const top = composerRef.current?.getBoundingClientRect().top;
      if (top == null) return;
      setEmojiPanelMaxHeight(Math.max(192, Math.min(352, Math.floor(top - 16))));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [showEmojiPicker]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const nextHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 68), 200);
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  }, [draft]);

  const notifyTyping = () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    const now = Date.now();
    if (now - lastTypingSentAt.current > TYPING_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      socket.emit("typing", { conversationId, isTyping: true });
    }

    if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);

    typingIdleTimer.current = setTimeout(() => {
      lastTypingSentAt.current = 0;
      socket.emit("typing", { conversationId, isTyping: false });
    }, TYPING_IDLE_MS);
  };

  const send = async () => {
    const body = draft.trim();
    const socket = socketRef.current;
    const attachmentIds = uploads.ids;

    if ((!body && attachmentIds.length === 0) || uploads.busy || uploads.hasErrors || !socket?.connected) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    setDraft("");
    setSlash(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "68px";
    }
    stickToBottom.current = true;

    const ack = (await socket
      .timeout(10000)
      .emitWithAck("message:send", { conversationId, body, attachmentIds })
      .catch(() => null)) as { ok: boolean; error?: string; message?: ChatMessage } | null;

    sendingRef.current = false;

    if (!ack?.ok) {
      // Keep the picked images in the tray so the agent can retry — unless the
      // server says they were already claimed (e.g. the ack timed out after save).
      if (ack?.error === ATTACHMENT_ERRORS.claimed) uploads.removeSent(attachmentIds);
      setDraft(body);
      onError(ack?.error ?? "Không gửi được tin nhắn.");
      return;
    }

    uploads.removeSent(attachmentIds);

    if (ack.message) {
      const sent = ack.message;
      setMessages((previous) =>
        previous.some((item) => item.id === sent.id) ? previous : [...previous, sent],
      );
    }
    onError(null);
  };

  const act = async (
    action: "claim" | "release" | "close" | "reopen" | "assign",
    agentId?: string,
  ) => {
    setBusy(true);
    await onAction(conversationId, action, agentId);
    setBusy(false);
  };

  /**
   * Drops a reply where the caret is.
   *
   * `range` is the `/shortcut` text to replace; without it the reply lands at
   * the caret rather than being appended, which is where the agent was typing.
   */
  const insertCanned = (template: CannedTemplate, range?: { start: number; end: number }) => {
    const element = textareaRef.current;
    const start = range?.start ?? element?.selectionStart ?? draft.length;
    const end = range?.end ?? element?.selectionEnd ?? start;
    const next = insertCannedText({ value: draft, start, end, text: template.text });

    setDraft(next.value);
    setSlash(null);
    setSlashIndex(0);
    setShowCannedMenu(false);

    // The textarea is controlled, so the caret can only be placed after React
    // has painted the new value.
    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleInsertEmoji = (emoji: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;

    // Functional update: two picks in quick succession must not write the same
    // stale draft twice.
    setDraft((prev) => prev.slice(0, start) + emoji + prev.slice(end));
    setSlash(null);

    // Keep the picker open like Messenger: people send several in a row.
    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      const caret = start + emoji.length;
      input.setSelectionRange(caret, caret);
    });
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  /**
   * Like Facebook: one reaction per message per agent. Picking a different
   * emoji swaps it, picking the same one takes it back.
   *
   * Reactions are stored on the message and shared with the visitor, so the
   * server is the source of truth: the ack (or the broadcast) is what repaints,
   * and a failed send leaves the previous state alone.
   */
  const handleToggleReaction = (messageId: string, emoji: string) => {
    const socket = socketRef.current;

    if (!socket) return;

    const mine = summarizeReactions(
      messagesRef.current.find((message) => message.id === messageId)?.reactions,
      currentUser.id,
    ).mine;

    const next = mine === emoji ? "" : emoji;

    void socket
      .timeout(8000)
      .emitWithAck("message:react", { messageId, emoji: next })
      .then((ack: { ok?: boolean; reactions?: MessageReaction[] }) => {
        if (ack?.ok && Array.isArray(ack.reactions)) {
          applyMessageReactions(messageId, ack.reactions);
        }
      })
      .catch(() => {
        // A lost ack leaves the previous badges in place rather than showing a
        // reaction the server never stored.
      });
  };

  /** Reactions are message state, so they ride along with the message itself. */
  const applyMessageReactions = (messageId: string, reactions: MessageReaction[]) => {
    if (recovering.current) {
      bufferedReactions.current.set(messageId, reactions);
      return;
    }

    setMessages((previous) =>
      previous.map((message) => (message.id === messageId ? { ...message, reactions } : message)),
    );
  };

  const applyFormat = (prefix: string, suffix: string = prefix) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = draft.substring(start, end);
    const replacement = `${prefix}${selected || "văn bản"}${suffix}`;
    const newDraft = draft.substring(0, start) + replacement + draft.substring(end);
    setDraft(newDraft);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 transition-colors ${currentTheme.classes.container}`}>
      {/* 1. SaaS Thread Header with Theme Switcher */}
      <header
        className={`h-14 px-3 sm:px-5 border-b flex items-center justify-between gap-2.5 shrink-0 z-10 transition-colors ${currentTheme.classes.header} ${currentTheme.classes.headerBorder}`}
      >
        {/* Left: Contact Identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            className="md:hidden p-1.5 -ml-1 opacity-70 hover:opacity-100 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Quay lại danh sách"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div
            className={`w-9 h-9 rounded-xl ${palette.bg} border flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs`}
          >
            {initials}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs sm:text-sm font-semibold truncate ${currentTheme.classes.headerTitle}`}>
                {label}
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-2xs flex items-center gap-1 ${
                  closed
                    ? currentTheme.classes.headerStatusClosed
                    : currentTheme.classes.headerStatusOpen
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    closed ? "bg-neutral-400" : "bg-emerald-500 animate-pulse"
                  }`}
                />
                {closed ? "Đã đóng" : "Đang mở"}
              </span>
            </div>

            <div className={`text-[11px] truncate flex items-center gap-1.5 mt-0.5 ${currentTheme.classes.headerSub}`}>
              <span>{conversation.siteName ?? "Web Widget"}</span>
              <span>·</span>
              <span className="font-medium">
                {conversation.assignedAgentId
                  ? mine
                    ? "Bạn đang phụ trách"
                    : `${conversation.assignedAgentName ?? "Đồng nghiệp"} phụ trách`
                  : "Chưa ai tiếp nhận"}
              </span>
            </div>
          </div>
        </div>

        {/* Conversation actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!conversation.assignedAgentId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("claim")}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer ${currentTheme.classes.sendButton}`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tiếp nhận</span>
            </button>
          )}

          {conversation.assignedAgentId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("release")}
              title="Bỏ phân công để người khác tiếp nhận"
              className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition cursor-pointer shadow-2xs ${currentTheme.classes.actionButton}`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Bỏ nhận</span>
            </button>
          )}

          {isProjectOwner && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setAssigning(true)}
              title="Chuyển hội thoại cho đồng nghiệp"
              className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition cursor-pointer shadow-2xs ${currentTheme.classes.actionButton}`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Chuyển giao</span>
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void act(closed ? "reopen" : "close")}
            title={closed ? "Mở lại cuộc trò chuyện" : "Kết thúc cuộc trò chuyện"}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition cursor-pointer shadow-2xs ${
              closed
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                : currentTheme.classes.actionButton
            }`}
          >
            {closed ? <RotateCcw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{closed ? "Mở lại" : "Kết thúc"}</span>
          </button>

          {/* Toggle Inspector Sidebar */}
          <button
            type="button"
            onClick={onToggleRightSidebar}
            title={showRightSidebar ? "Ẩn thông tin khách" : "Hiện thông tin khách"}
            className={`p-1.5 rounded-lg border transition cursor-pointer hidden lg:inline-flex shadow-2xs ${
              showRightSidebar
                ? currentTheme.uiAccent.brandBadge
                : currentTheme.classes.actionButton
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Messages Stream */}
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 space-y-3.5 transition-colors ${currentTheme.classes.stream}`}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs opacity-60 gap-2">
            <Loader2 className={`w-4 h-4 animate-spin ${currentTheme.uiAccent.icon}`} />
            <span>Đang tải tin nhắn…</span>
          </div>
        ) : (
          <>
            {hasOlder && (
              <div className="text-center pb-2">
                <button
                  type="button"
                  disabled={loadingOlder}
                  onClick={() => void loadOlder()}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1 rounded-full border disabled:opacity-50 transition shadow-2xs cursor-pointer ${currentTheme.classes.actionButton}`}
                >
                  <ChevronUp className="w-3 h-3" />
                  <span>{loadingOlder ? "Đang tải…" : "Tải tin nhắn cũ hơn"}</span>
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 shadow-xs ${currentTheme.classes.actionButton}`}>
                  <MessageSquare className="w-6 h-6 opacity-60" />
                </div>
                <p className="text-xs opacity-70">Chưa có tin nhắn nào trong hội thoại này.</p>
              </div>
            ) : (
              messages.map((message, idx) => {
                // Check if date divider is needed
                const prev = messages[idx - 1];
                const showDivider =
                  idx === 0 ||
                  (prev &&
                    new Date(prev.createdAt).toDateString() !==
                      new Date(message.createdAt).toDateString());

                if (message.senderKind === "system") {
                  return (
                    <Fragment key={message.id}>
                      {showDivider && (
                        <div className="flex justify-center my-3">
                          <span
                            className={`text-[11px] font-medium px-3 py-1 rounded-full border shadow-2xs ${currentTheme.classes.dateDivider}`}
                          >
                            {formatDateDivider(message.createdAt)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-center py-1">
                        <span
                          className={`text-[11px] font-medium px-3 py-1 rounded-full border shadow-2xs ${currentTheme.classes.systemMessage}`}
                        >
                          {message.body}
                        </span>
                      </div>
                    </Fragment>
                  );
                }

                const fromAgent = message.senderKind === "agent";
                const senderLabel = fromAgent
                  ? message.senderName || message.sender?.name || "Nhân viên hỗ trợ"
                  : message.senderName || visitorLabel(conversation);

                const { badges: reactionBadges, mine: myReaction } = summarizeReactions(
                  message.reactions,
                  currentUser.id,
                  reactorName,
                );

                return (
                  <Fragment key={message.id}>
                    {showDivider && (
                      <div className="flex justify-center my-3">
                        <span
                          className={`text-[11px] font-medium px-3 py-1 rounded-full border shadow-2xs ${currentTheme.classes.dateDivider}`}
                        >
                          {formatDateDivider(message.createdAt)}
                        </span>
                      </div>
                    )}

                    <div
                      className={`flex items-end gap-2 ${
                        fromAgent ? "justify-end" : "justify-start"
                      } group relative`}
                    >
                      {/* Avatar on left for visitor in Slack dense mode */}
                      {!fromAgent && currentTheme.id === "slack-dense" && (
                        <div
                          className={`w-8 h-8 rounded-lg ${palette.bg} border flex items-center justify-center font-bold text-xs shrink-0 mb-1`}
                        >
                          {initials}
                        </div>
                      )}

                      <div className="max-w-[85%] sm:max-w-[72%] relative">
                        {/* Full reaction picker, opened from the "+" in the bar */}
                        {reactionPickerFor?.id === message.id && (
                          <EmojiPopover
                            anchor={reactionPickerFor.rect}
                            theme={currentTheme}
                            onPick={(emoji) => {
                              handleToggleReaction(message.id, emoji);
                              setReactionPickerFor(null);
                            }}
                            onClose={() => setReactionPickerFor(null)}
                          />
                        )}

                        {/* Sender Label */}
                        <div
                          className={`text-[10px] mb-1 px-1 font-medium ${
                            fromAgent
                              ? `text-right ${currentTheme.classes.agentSender}`
                              : `text-left ${currentTheme.classes.visitorSender}`
                          }`}
                        >
                          {senderLabel}
                        </div>

                        {/* Message Bubble Body, with its hover actions beside it */}
                        <div className="relative">
                          <div
                            className={`px-4 py-2.5 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] transition-all ${
                              fromAgent
                                ? currentTheme.classes.agentBubble
                                : currentTheme.classes.visitorBubble
                            }`}
                          >
                            <MessageAttachments
                              attachments={message.attachments}
                              tone={fromAgent ? "agent" : "visitor"}
                              className={message.body ? "mb-1.5" : ""}
                            />
                            {message.body}
                          </div>

                          {/* Side actions: react and copy. Kept beside the bubble
                              so they never cover the sender label or the message
                              above, and never get clipped at the top of the stream. */}
                          <div
                            data-quick-react=""
                            // visitorMeta, not agentMeta, on both sides: agentMeta
                            // is tinted for the agent bubble and washes out on the stream.
                            className={`absolute top-1/2 -translate-y-1/2 z-20 flex items-center gap-0.5 transition-opacity duration-150 ${
                              currentTheme.classes.visitorMeta
                            } ${
                              fromAgent ? "right-full mr-1 flex-row-reverse" : "left-full ml-1"
                            } ${
                              quickReactFor?.id === message.id || reactionPickerFor?.id === message.id
                                ? "opacity-100"
                                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                const streamTop = scrollRef.current?.getBoundingClientRect().top ?? 0;
                                setQuickReactFor((previous) =>
                                  previous?.id === message.id
                                    ? null
                                    : { id: message.id, below: rect.top - streamTop < 44 },
                                );
                              }}
                              className={`w-7 h-7 flex items-center justify-center rounded-full transition hover:bg-current/10 ${
                                quickReactFor?.id === message.id ? "bg-current/10" : ""
                              }`}
                              title="Thả cảm xúc"
                              aria-label="Thả cảm xúc"
                              aria-expanded={quickReactFor?.id === message.id}
                            >
                              <SmilePlus className="w-4 h-4" />
                            </button>
                            {message.body && (
                            <button
                              type="button"
                              onClick={() => void handleCopyMessage(message.id, message.body)}
                              className="w-7 h-7 flex items-center justify-center rounded-full transition hover:bg-current/10"
                              title={copiedId === message.id ? "Đã chép" : "Sao chép nội dung tin nhắn"}
                              aria-label="Sao chép nội dung tin nhắn"
                            >
                              {copiedId === message.id ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            )}

                            {quickReactFor?.id === message.id && (
                              <div
                                role="menu"
                                aria-label="Cảm xúc nhanh"
                                // Line the strip up with the buttons, but keep it
                                // inside the stream: beside a wide bubble there is
                                // not room for all seven buttons.
                                ref={(strip) => {
                                  const host = strip?.parentElement;
                                  const stream = scrollRef.current;
                                  if (!strip || !host || !stream) return;
                                  const bounds = stream.getBoundingClientRect();
                                  const anchor = host.getBoundingClientRect();
                                  const width = strip.offsetWidth;
                                  const preferred = fromAgent ? anchor.right - width : anchor.left;
                                  const left = Math.max(
                                    Math.min(preferred, bounds.right - 8 - width),
                                    bounds.left + 8,
                                  );
                                  strip.style.left = `${left - anchor.left}px`;
                                }}
                                className={`absolute ${
                                  quickReactFor.below ? "top-full mt-1" : "bottom-full mb-1"
                                } flex items-center gap-0.5 px-1.5 py-1 rounded-lg whitespace-nowrap ${
                                  currentTheme.classes.reactionBar
                                }`}
                              >
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      handleToggleReaction(message.id, emoji);
                                      setQuickReactFor(null);
                                    }}
                                    className={`w-7 h-7 flex items-center justify-center text-base rounded-full transition hover:scale-125 hover:bg-current/10 ${
                                      myReaction === emoji ? "bg-current/15 ring-1 ring-current/40" : ""
                                    }`}
                                    title={
                                      myReaction === emoji ? "Bỏ cảm xúc của bạn" : `Thả cảm xúc ${emoji}`
                                    }
                                  >
                                    {emoji}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  role="menuitem"
                                  data-emoji-trigger=""
                                  onClick={(event) => {
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    setQuickReactFor(null);
                                    setReactionPickerFor((previous) =>
                                      previous?.id === message.id
                                        ? null
                                        : { id: message.id, rect },
                                    );
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-full transition opacity-70 hover:opacity-100 hover:bg-current/10"
                                  title="Chọn cảm xúc khác"
                                  aria-label="Chọn cảm xúc khác"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reaction Badges */}
                        {reactionBadges.length > 0 && (
                          <div
                            className={`flex flex-wrap gap-1 mt-1 ${
                              fromAgent ? "justify-end" : "justify-start"
                            }`}
                          >
                            {reactionBadges.map((badge) => (
                              <button
                                key={badge.emoji}
                                type="button"
                                onClick={() => handleToggleReaction(message.id, badge.emoji)}
                                title={`${joinNames(
                                  badge.mine ? ["Bạn", ...badge.others] : badge.others,
                                )} đã thả ${badge.emoji}\n${
                                  badge.mine
                                    ? "Bấm để gỡ"
                                    : myReaction
                                      ? `Bấm để đổi sang ${badge.emoji}`
                                      : "Bấm để thả cùng"
                                }`}
                                className={`text-[11px] px-1.5 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition active:scale-90 ${currentTheme.classes.reactionBadge} ${
                                  badge.mine ? "ring-1 ring-current/40 font-semibold" : ""
                                }`}
                              >
                                <span>{badge.emoji}</span>
                                <span className="font-mono text-[10px] font-bold">
                                  {badge.count}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Timestamp & Delivery Status */}
                        <div
                          className={`text-[10px] mt-1 flex items-center gap-1 ${
                            fromAgent
                              ? `justify-end pr-1 ${currentTheme.classes.agentMeta}`
                              : `pl-1 ${currentTheme.classes.visitorMeta}`
                          }`}
                        >
                          <span>{formatClock(message.createdAt)}</span>
                          {fromAgent && <CheckCheck className={`w-3.5 h-3.5 opacity-80 ${currentTheme.uiAccent.icon}`} />}
                        </div>
                      </div>
                    </div>
                  </Fragment>
                );
              })
            )}
          </>
        )}

        {/* Realtime Typing Indicator */}
        {visitorTyping && (
          <div className="flex items-center gap-2 text-xs pl-2 py-1 animate-in fade-in">
            <div
              className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-2xs ${currentTheme.classes.typingBubble}`}
            >
              <span className="flex gap-1 items-center">
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s] ${currentTheme.classes.typingDot}`}
                />
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s] ${currentTheme.classes.typingDot}`}
                />
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-bounce ${currentTheme.classes.typingDot}`}
                />
              </span>
              <span className="text-[11px] italic opacity-80">Khách đang soạn tin nhắn…</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. SaaS Composer Box */}
      <div
        ref={composerRef}
        className={`p-3 sm:p-4 shrink-0 transition-colors relative ${currentTheme.classes.composerWrapper}`}
      >
        {/* Floating Slash Autocomplete Palette */}
        {slash && (
          <div className="absolute bottom-full left-3 sm:left-4 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CannedSuggestions
              hits={slashHits}
              activeIndex={slashIndex}
              onHover={setSlashIndex}
              onPick={(template) =>
                insertCanned(template, {
                  start: slash.start,
                  end: slash.start + slash.query.length + 1,
                })
              }
              theme={currentTheme}
            />
          </div>
        )}

        {/* Floating Full Canned Responses Modal / Palette */}
        {showCannedMenu && (
          <div
            ref={cannedPanelRef}
            className="absolute bottom-full left-3 sm:left-4 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <CannedPickerPanel
              personal={personalTemplates}
              effective={effective}
              siteName={siteName}
              onPick={(template) => insertCanned(template)}
              onClose={() => setShowCannedMenu(false)}
              canManageSite={isProjectOwner}
              theme={currentTheme}
            />
          </div>
        )}

        {/* Floating emoji panel — anchored to the composer, not the toolbar button,
            so it cannot overflow the right edge on a narrow screen. */}
        {showEmojiPicker && (
          <div
            ref={emojiPanelRef}
            className="absolute bottom-full left-3 sm:left-4 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <EmojiPickerPanel
              theme={currentTheme}
              quick={QUICK_EMOJIS}
              onPick={handleInsertEmoji}
              onClose={() => setShowEmojiPicker(false)}
              maxHeight={emojiPanelMaxHeight}
            />
          </div>
        )}

        {closed && (
          <div className="mb-2.5 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400 flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Hội thoại này đã kết thúc. Gửi tin nhắn mới sẽ tự động kích hoạt mở lại hội thoại cho khách.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void act("reopen")}
              disabled={busy}
              className="text-xs font-semibold underline shrink-0 cursor-pointer disabled:opacity-50 hover:opacity-80"
            >
              Mở lại ngay
            </button>
          </div>
        )}

        {/* Outer SaaS Input Container */}
        <div
          {...dropProps}
          className={`transition-all flex flex-col ${currentTheme.classes.composerInner} ${
            isDragging ? "outline-2 outline-dashed outline-amber-500 outline-offset-2 bg-amber-50/60" : ""
          }`}
        >
          <AttachmentTray
            items={uploads.items}
            onRemove={uploads.remove}
            onRetry={uploads.retry}
            notice={uploads.notice}
            onDismissNotice={uploads.dismissNotice}
          />

          {/* Auto-resizing Textarea */}
          <textarea
            ref={textareaRef}
            value={draft}
            onPaste={(event) => {
              if (connected) handleImagePaste(event, uploads.addFiles);
            }}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              setSlash(findSlashQuery(value, event.target.selectionStart ?? value.length));
              setSlashIndex(0);
              notifyTyping();
            }}
            onSelect={(event) => {
              // Moving the caret out of a `/command` has to dismiss the list;
              // otherwise Enter would insert into a range the agent left behind.
              const input = event.currentTarget;
              const next = findSlashQuery(input.value, input.selectionStart ?? input.value.length);

              if (!next) {
                if (slash) setSlash(null);
                return;
              }

              if (slash?.start !== next.start || slash.query !== next.query) setSlashIndex(0);
              setSlash(next);
            }}
            onKeyDown={(event) => {
              // A Vietnamese IME commits a word with Enter; sending on that
              // keystroke would fire a half-written reply.
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;

              if (slash) {
                if (event.key === "ArrowDown" && slashHits.length > 0) {
                  event.preventDefault();
                  setSlashIndex((index) => (index + 1) % slashHits.length);
                  return;
                }
                if (event.key === "ArrowUp" && slashHits.length > 0) {
                  event.preventDefault();
                  setSlashIndex((index) => (index - 1 + slashHits.length) % slashHits.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  // The list is open, so Enter picks a reply instead of sending
                  // a message that still contains the `/command` text.
                  event.preventDefault();

                  const hit = slashHits[slashIndex] ?? slashHits[0];

                  if (!hit) {
                    setSlash(null);
                    return;
                  }

                  // Re-read the caret: the range stored with the list can be
                  // stale if the agent moved it without changing the text.
                  const caret = event.currentTarget.selectionStart ?? draft.length;
                  const live = findSlashQuery(draft, caret);

                  insertCanned(hit, live ? { start: live.start, end: caret } : undefined);
                  return;
                }
              }

              if (event.key === "Escape") {
                if (showEmojiPicker) {
                  // The panel refocuses the textarea after a pick, so Escape
                  // arrives here rather than on the panel.
                  event.preventDefault();
                  setShowEmojiPicker(false);
                  return;
                }

                if (slash) {
                  event.preventDefault();
                  setSlash(null);
                }
                return;
              }

              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            disabled={!connected}
            placeholder={
              connected
                ? `Nhập câu trả lời… (Gõ / để chọn mẫu câu nhanh, Shift+Enter xuống dòng)`
                : "Đang kết nối lại máy chủ…"
            }
            aria-label="Nội dung trả lời"
            className={`w-full resize-none min-h-[64px] max-h-48 px-3.5 pt-3 pb-2 outline-none leading-relaxed text-xs sm:text-[13px] rounded-t-[inherit] disabled:opacity-50 ${currentTheme.classes.composerTextarea}`}
          />

          {/* SaaS Bottom Integrated Toolbar */}
          <div
            className={`px-3 py-2 flex items-center justify-between gap-2 relative transition-colors rounded-b-[inherit] ${currentTheme.classes.composerToolbar}`}
          >
            {/* Left Quick Tools */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              {/* Markdown Quick Formatting */}
              <div
                className={`flex items-center rounded-lg p-0.5 border ${
                  currentTheme.id === "front-amber"
                    ? "bg-amber-100/60 border-amber-200/80 text-amber-950"
                    : "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 text-current"
                }`}
              >
                <button
                  type="button"
                  onClick={() => applyFormat("**")}
                  title="In đậm (Bold)"
                  className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition cursor-pointer text-current opacity-70 hover:opacity-100"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("*")}
                  title="In nghiêng (Italic)"
                  className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition cursor-pointer text-current opacity-70 hover:opacity-100"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("`")}
                  title="Mã nguồn (Inline Code)"
                  className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition cursor-pointer text-current opacity-70 hover:opacity-100"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("> ", "")}
                  title="Trích dẫn (Quote)"
                  className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition cursor-pointer text-current opacity-70 hover:opacity-100"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
              </div>

              <AttachButton
                onFiles={uploads.addFiles}
                disabled={!connected}
              />

              <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5 hidden sm:block" />

              {/* Canned Responses Popover Trigger */}
              <div className="relative" ref={cannedMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCannedMenu(!showCannedMenu);
                    setShowEmojiPicker(false);
                  }}
                  title="Mẫu câu phản hồi nhanh (Gõ / trong ô chat)"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border select-none shadow-2xs ${
                    showCannedMenu
                      ? currentTheme.uiAccent.brandBadge
                      : currentTheme.classes.actionButton
                  }`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${currentTheme.uiAccent.icon}`} />
                  <span className="font-medium">Mẫu câu</span>
                  <span
                    className={`text-[10px] font-mono px-1 py-0.2 rounded border ${
                      currentTheme.id === "front-amber"
                        ? "bg-amber-100/90 border-amber-300/80 text-amber-900 font-semibold"
                        : "bg-black/5 dark:bg-white/10 border-black/5 dark:border-white/10 opacity-70"
                    }`}
                  >
                    /
                  </span>
                  {totalCannedCount > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                        currentTheme.id === "front-amber"
                          ? "bg-amber-200/80 text-amber-950 border border-amber-300/60"
                          : "bg-black/5 dark:bg-white/10 opacity-75"
                      }`}
                    >
                      {totalCannedCount}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3 h-3 opacity-60 transition-transform duration-150 ${
                      showCannedMenu ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Emoji Picker */}
              <div className="relative" ref={emojiPickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmojiPicker(!showEmojiPicker);
                    setShowCannedMenu(false);
                  }}
                  title="Chèn biểu tượng cảm xúc"
                  className={`p-1.5 rounded-lg border transition cursor-pointer shadow-2xs ${
                    showEmojiPicker
                      ? currentTheme.uiAccent.brandBadge
                      : currentTheme.classes.actionButton
                  }`}
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right Tools: Keyboard Shortcut Hint & Send Action */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] opacity-70 font-medium hidden md:inline-flex items-center gap-1">
                <kbd
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-mono shadow-2xs ${
                    currentTheme.id === "front-amber"
                      ? "bg-amber-100/80 border-amber-200/90 text-amber-900"
                      : "bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/15"
                  }`}
                >
                  Enter
                </kbd>
                gửi
              </span>

              <button
                type="button"
                onClick={() => void send()}
                disabled={
                  !connected || uploads.busy || uploads.hasErrors || (!draft.trim() && uploads.ids.length === 0)
                }
                title={
                  uploads.busy
                    ? "Đang tải ảnh lên…"
                    : uploads.hasErrors
                      ? ATTACHMENT_ERRORS.retryHint
                      : undefined
                }
                aria-label="Gửi tin nhắn"
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs cursor-pointer active:scale-95 ${currentTheme.classes.sendButton}`}
              >
                <span>Gửi</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Assign Modal */}
      {assigning && (
        <AssignDialog
          siteId={conversation.siteId}
          currentAssigneeId={conversation.assignedAgentId}
          onClose={() => setAssigning(false)}
          onPick={(agentId) => {
            setAssigning(false);
            void act("assign", agentId);
          }}
        />
      )}
    </div>
  );
}

/** Right details inspector */
function CustomerInspector({
  conversation,
  currentUser,
  onClose,
  onAction,
  currentTheme,
}: {
  conversation: Conversation;
  currentUser: CurrentUser;
  onClose: () => void;
  onAction: (
    conversationId: string,
    action: "claim" | "release" | "close" | "reopen" | "assign",
    agentId?: string,
  ) => Promise<void>;
  currentTheme: ChatTheme;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const label = visitorLabel(conversation);
  const initials = getInitials(label);
  const palette = getAvatarPalette(label);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Header */}
      <div className="h-14 px-4 sm:px-5 border-b border-neutral-200/80 flex items-center justify-between shrink-0 shadow-2xs">
        <h3 className="text-xs font-semibold text-neutral-900">Thông tin khách hàng</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng thông tin"
          className="text-neutral-400 hover:text-neutral-700 p-1 rounded-md hover:bg-neutral-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Profile Card */}
        <div className="text-center p-4 rounded-xl bg-neutral-50/70 border border-neutral-200/80 shadow-2xs">
          <div
            className={`w-14 h-14 rounded-2xl ${palette.bg} border flex items-center justify-center font-bold text-base mx-auto mb-2 shadow-xs`}
          >
            {initials}
          </div>
          <h4 className="text-sm font-semibold text-neutral-900">{label}</h4>
          {conversation.visitor?.email ? (
            <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-500 mt-1">
              <span>{conversation.visitor.email}</span>
              <button
                onClick={() => copyToClipboard(conversation.visitor!.email!, "email")}
                title="Sao chép email"
                className="text-neutral-400 hover:text-neutral-700 p-0.5"
              >
                {copiedField === "email" ? (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <span className="inline-block text-[11px] text-neutral-400 mt-0.5">Khách vãng lai</span>
          )}
        </div>

        {/* Structured Session Details */}
        <div className="rounded-xl bg-white border border-neutral-200/80 p-3.5 space-y-3 shadow-2xs">
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Chi tiết phiên hỗ trợ
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Trạng thái</span>
            <span
              className={`font-semibold px-2 py-0.5 rounded-full text-[11px] border shadow-2xs flex items-center gap-1 ${
                conversation.status === "closed"
                  ? "bg-neutral-100 text-neutral-600 border-neutral-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  conversation.status === "closed" ? "bg-neutral-400" : "bg-emerald-500"
                }`}
              />
              {conversation.status === "closed" ? "Đã đóng" : "Đang mở"}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Phụ trách</span>
            <span className="font-medium text-neutral-900">
              {conversation.assignedAgentId
                ? conversation.assignedAgentId === currentUser.id
                  ? "Bạn (Chuyên viên)"
                  : (conversation.assignedAgentName ?? "Đồng nghiệp")
                : "Chưa phân công"}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Kênh kết nối</span>
            <span className="font-medium text-neutral-900">Web Chat Widget</span>
          </div>

          {conversation.siteName && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500">Website / Dự án</span>
              <span className="font-medium text-neutral-900 truncate max-w-[140px]">
                {conversation.siteName}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Bắt đầu lúc</span>
            <span className="text-neutral-700 font-medium tabular-nums">
              {formatFullDateTime(conversation.createdAt)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Mã Visitor ID</span>
            <div className="flex items-center gap-1 font-mono text-[11px] text-neutral-700 bg-neutral-50 px-1.5 py-0.5 rounded border border-neutral-200">
              <span>{conversation.visitorId.slice(0, 8)}…</span>
              <button
                onClick={() => copyToClipboard(conversation.visitorId, "visitorId")}
                title="Sao chép Visitor ID"
                className="text-neutral-400 hover:text-neutral-700 ml-0.5"
              >
                {copiedField === "visitorId" ? (
                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Button in panel */}
        {!conversation.assignedAgentId && (
          <button
            type="button"
            onClick={() => void onAction(conversation.id, "claim")}
            className={`w-full py-2 rounded-xl text-white text-xs font-semibold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${currentTheme.uiAccent.primaryBtn}`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span>Tiếp nhận cuộc trò chuyện này</span>
          </button>
        )}
      </div>
      <InternalNotes key={conversation.id} conversationId={conversation.id} />
    </div>
  );
}

/** Assign dialog */
function AssignDialog({
  siteId,
  currentAssigneeId,
  onClose,
  onPick,
}: {
  siteId: string;
  currentAssigneeId: string | null;
  onClose: () => void;
  onPick: (agentId: string) => void;
}) {
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sites/${siteId}/members`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("members"))))
      .then((data: { members: MemberView[] }) => {
        if (!cancelled) setMembers(data.members);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được danh sách người trong dự án.");
      });

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const filteredMembers = (members ?? []).filter(
    (m) =>
      m.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (m.email ?? "").toLowerCase().includes(filterQuery.toLowerCase()),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chuyển hội thoại"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-neutral-200 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-4 py-3 border-b border-neutral-200/90 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-amber-600" />
            <h2 className="text-xs font-semibold text-neutral-900">
              Chuyển hội thoại cho đồng nghiệp
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-neutral-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc email…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-neutral-200 text-xs outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
            />
          </div>
        </div>

        <div className="p-2 max-h-72 overflow-y-auto">
          {error ? (
            <p className="p-3 text-xs text-rose-700">{error}</p>
          ) : members === null ? (
            <div className="flex items-center justify-center p-6 text-xs text-neutral-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              <span>Đang tải thành viên…</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="p-4 text-xs text-center text-neutral-400">
              {filterQuery
                ? "Không tìm thấy đồng nghiệp phù hợp"
                : "Dự án này chưa có thành viên nào khác."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredMembers.map((member) => (
                <li key={member.userId}>
                  <button
                    type="button"
                    disabled={member.userId === currentAssigneeId}
                    onClick={() => onPick(member.userId)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-50 disabled:opacity-50 disabled:hover:bg-transparent transition cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-neutral-900">
                        {member.name}
                        {member.userId === currentAssigneeId && (
                          <span className="ml-1.5 text-[10px] text-amber-600 font-normal">
                            (đang phụ trách)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {member.email ?? "—"} ·{" "}
                        {member.role === "owner" ? "Quản trị viên" : "Chuyên viên"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
