"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleCheck,
  Globe,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  User as UserIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AttachButton,
  AttachmentTray,
  MessageAttachments,
  handleImagePaste,
  useAttachmentUploads,
  useImageDrop,
} from "@/components/attachments";
import { ATTACHMENT_ERRORS } from "@/lib/attachments";
import { useSocketEvent } from "@/components/notifications/NotificationsProvider";
import { Select, type SelectOption } from "@/components/ui";
import type {
  TicketCounts,
  TicketListResult,
  TicketStaff,
  TicketStatus,
  TicketView,
} from "@/lib/tickets";

type Tab = "all" | TicketStatus;

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "new", label: "Mới" },
  { key: "in_progress", label: "Đang xử lý" },
  { key: "done", label: "Đã xong" },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "Mới",
  in_progress: "Đang xử lý",
  done: "Đã xong",
};

const STATUS_PILL: Record<TicketStatus, string> = {
  new: "bg-amber-50 text-amber-800 border-amber-200/80",
  in_progress: "bg-white text-amber-950 border-amber-300/80",
  done: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

const STATUS_DOT: Record<TicketStatus, string> = {
  new: "bg-amber-500",
  in_progress: "bg-orange-500",
  done: "bg-neutral-400",
};

/** The one-click next step shown as the primary action in the detail header. */
const NEXT_STEP: Record<TicketStatus, { status: TicketStatus; label: string; icon: LucideIcon }> = {
  new: { status: "in_progress", label: "Bắt đầu xử lý", icon: Play },
  in_progress: { status: "done", label: "Đánh dấu đã xong", icon: CircleCheck },
  done: { status: "in_progress", label: "Mở lại", icon: RotateCcw },
};

// Inbox (amber theme) tokens, kept verbatim so both pages look alike.
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1";
const PRIMARY_BUTTON =
  "bg-gradient-to-r from-[#EA580C] to-[#F59E0B] hover:brightness-105 text-white rounded-lg shadow-sm shadow-orange-600/30 font-medium";
const ACTION_BUTTON =
  "bg-white hover:bg-amber-100 text-amber-950 border border-amber-300/80 rounded-lg shadow-2xs";
const ASSIGNED_MINE = "bg-amber-50 text-amber-800 border-amber-200/90 font-medium";
const HIDE_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// Same list, order and hash as InboxClient so a visitor gets the same colour on both pages
// (the input is the same too: name, else email, like visitorLabel()).
const AVATAR_PALETTES = [
  "bg-amber-100 text-amber-800 border-amber-200/80",
  "bg-indigo-100 text-indigo-700 border-indigo-200/80",
  "bg-purple-100 text-purple-700 border-purple-200/80",
  "bg-emerald-100 text-emerald-700 border-emerald-200/80",
  "bg-amber-100 text-amber-800 border-amber-200/80",
  "bg-rose-100 text-rose-700 border-rose-200/80",
  "bg-teal-100 text-teal-700 border-teal-200/80",
  "bg-slate-100 text-slate-700 border-slate-300",
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

function ticketLabel(ticket: TicketView): string {
  return ticket.name || ticket.email;
}

const EMPTY_COUNTS: TicketCounts = { new: 0, in_progress: 0, done: 0 };

type Props = {
  initial: TicketListResult | null;
  initialError: string | null;
  initialSelected: TicketView | null;
  initialSelectedId: string | null;
  currentUser: { id: string; name: string };
  isAdmin: boolean;
  staff: TicketStaff[];
  sites: { id: string; name: string }[];
};

function formatRelative(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Math.max(0, Date.now() - time) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)}p`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}n`;
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // no JSON body
  }
  return `Lỗi ${response.status}`;
}

function StatusPill({ status, round = false }: { status: TicketStatus; round?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] whitespace-nowrap shrink-0 border shadow-2xs ${
        round ? "px-2 py-0.5 rounded-full font-semibold" : "px-1.5 py-0.5 rounded font-medium"
      } ${STATUS_PILL[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Avatar({ label, size = "md" }: { label: string; size?: "md" | "lg" }) {
  return (
    <div
      aria-hidden="true"
      className={`${size === "lg" ? "w-10 h-10" : "w-9 h-9"} rounded-xl ${getAvatarPalette(
        label,
      )} border flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs`}
    >
      {getInitials(label)}
    </div>
  );
}

export function TicketsClient({
  initial,
  initialError,
  initialSelected,
  initialSelectedId,
  currentUser,
  isAdmin,
  staff,
  sites,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<TicketView[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [counts, setCounts] = useState<TicketCounts>(initial?.counts ?? EMPTY_COUNTS);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(initialError);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelected?.id ?? initialSelectedId,
  );
  const [selected, setSelected] = useState<TicketView | null>(initialSelected);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const listVersion = useRef(0);
  const detailVersion = useRef(0);
  const firstRender = useRef(true);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // --- list ----------------------------------------------------------------

  const loadList = useCallback(
    async (opts: { tab: Tab; q: string; siteId: string; page: number; append?: boolean }) => {
      const version = ++listVersion.current;
      setLoadingList(true);
      const query = new URLSearchParams();
      if (opts.tab !== "all") query.set("status", opts.tab);
      if (opts.q) query.set("q", opts.q);
      if (opts.siteId) query.set("siteId", opts.siteId);
      if (opts.page > 1) query.set("page", String(opts.page));
      try {
        const response = await fetch(`/api/tickets?${query.toString()}`, { cache: "no-store" });
        if (version !== listVersion.current) return;
        if (!response.ok) {
          setListError(await readError(response));
          return;
        }
        const data = (await response.json()) as TicketListResult;
        if (version !== listVersion.current) return;
        setItems((prev) => {
          if (!opts.append) return data.items;
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...data.items.filter((item) => !seen.has(item.id))];
        });
        setTotal(data.total);
        setCounts(data.counts);
        setListError(null);
      } catch {
        if (version === listVersion.current) setListError("Không thể kết nối máy chủ.");
      } finally {
        if (version === listVersion.current) setLoadingList(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    // The server already rendered the default list.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPage(1);
    void loadList({ tab, q: debouncedSearch, siteId, page: 1 });
  }, [tab, debouncedSearch, siteId, loadList]);

  const refreshList = useCallback(() => {
    // Reload every page already shown so "Xem thêm" results do not vanish.
    // loadList bumps listVersion synchronously, so reading it right after the
    // call gives this load's version; a newer load overtaking it ends the chain.
    void (async () => {
      let pending = loadList({ tab, q: debouncedSearch, siteId, page: 1 });
      let mine = listVersion.current;
      await pending;
      for (let p = 2; p <= page; p++) {
        if (listVersion.current !== mine) return;
        pending = loadList({ tab, q: debouncedSearch, siteId, page: p, append: true });
        mine = listVersion.current;
        await pending;
      }
    })();
  }, [loadList, tab, debouncedSearch, siteId, page]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    void loadList({ tab, q: debouncedSearch, siteId, page: next, append: true });
  };

  // --- detail --------------------------------------------------------------

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    const version = ++detailVersion.current;
    if (!quiet) setLoadingDetail(true);
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (version !== detailVersion.current) return;
      if (!response.ok) {
        setDetailError(await readError(response));
        if (response.status === 403 || response.status === 404) setSelected(null);
        return;
      }
      const data = (await response.json()) as TicketView;
      if (version !== detailVersion.current) return;
      setSelected(data);
      setDetailError(null);
      setItems((prev) => prev.map((item) => (item.id === data.id ? data : item)));
    } catch {
      if (version === detailVersion.current) setDetailError("Không thể kết nối máy chủ.");
    } finally {
      if (version === detailVersion.current) setLoadingDetail(false);
    }
  }, []);

  // A ?ticket= id the server could not resolve (e.g. fetch failed) is retried here.
  useEffect(() => {
    if (initialSelectedId && !initialSelected) void loadDetail(initialSelectedId);
  }, [initialSelectedId, initialSelected, loadDetail]);

  const selectTicket = (ticket: TicketView | null) => {
    detailVersion.current++;
    setSelectedId(ticket?.id ?? null);
    setSelected(ticket);
    setDetailError(null);
    setLoadingDetail(false);
    router.replace(ticket ? `${pathname}?ticket=${encodeURIComponent(ticket.id)}` : pathname, {
      scroll: false,
    });
    if (ticket) void loadDetail(ticket.id, true);
  };

  /** Applies a fresh TicketView from a mutation to both panes. */
  const applyTicket = (ticket: TicketView) => {
    detailVersion.current++;
    setSelected(ticket);
    setItems((prev) => prev.map((item) => (item.id === ticket.id ? ticket : item)));
  };

  // --- realtime ------------------------------------------------------------

  useSocketEvent("ticket:changed", (payload) => {
    refreshList();
    const id =
      payload && typeof payload === "object" && "id" in payload && typeof payload.id === "string"
        ? payload.id
        : null;
    const current = selectedIdRef.current;
    if (current && (!id || id === current)) void loadDetail(current, true);
  });

  // --- render --------------------------------------------------------------

  const countFor = (key: Tab): number =>
    key === "all" ? counts.new + counts.in_progress + counts.done : counts[key];

  const filtering = Boolean(debouncedSearch || siteId || tab !== "all");

  const siteOptions: SelectOption[] = [
    { value: "", label: "Tất cả website" },
    ...sites.map((site) => ({ value: site.id, label: site.name })),
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8F9FA]">
      <header className="h-14 shrink-0 bg-white border-b border-neutral-200/80 px-4 sm:px-6 flex items-center justify-between gap-3 shadow-2xs z-10">
        <div className="relative min-w-0 flex-1">
        <div className={`flex items-center gap-3 min-w-0 overflow-x-auto py-1 pr-4 md:pr-0 ${HIDE_SCROLLBAR}`}>
          <div className="hidden sm:flex items-center gap-2 pr-2 border-r border-neutral-200 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border shadow-2xs bg-amber-50 text-amber-800 border-amber-200/90 font-semibold">
              <LifeBuoy className="w-4 h-4" />
            </div>
            <div className="font-semibold text-xs text-neutral-900 whitespace-nowrap">Ticket hỗ trợ</div>
          </div>

          <div
            role="tablist"
            aria-label="Lọc ticket theo trạng thái"
            className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200/60 shadow-2xs shrink-0"
          >
            {TABS.map(({ key, label }) => {
              const active = key === tab;
              const count = countFor(key);
              const attention = key === "new" && count > 0;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer select-none whitespace-nowrap ${FOCUS} ${
                    active
                      ? "bg-white text-neutral-900 shadow-xs font-semibold"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60"
                  }`}
                >
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums leading-none ${
                        attention
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
        </div>
          {/* Hints on small screens that the tabs scroll sideways. */}
          <div
            aria-hidden="true"
            className="md:hidden pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            refreshList();
            if (selectedId) void loadDetail(selectedId, true);
          }}
          disabled={loadingList}
          title="Làm mới danh sách ticket"
          aria-label="Làm mới danh sách ticket"
          className={`p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 ${FOCUS}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? "animate-spin text-amber-600" : ""}`} />
        </button>
      </header>

      {listError && (
        <div className="bg-rose-50 border-b border-rose-200 text-xs text-rose-800 px-4 py-2 flex items-center justify-between gap-3">
          <span>Không thể tải danh sách ticket: {listError}</span>
          <button
            type="button"
            onClick={() => setListError(null)}
            aria-label="Đóng thông báo lỗi"
            className={`text-rose-500 hover:text-rose-800 p-0.5 rounded ${FOCUS}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 divide-x divide-neutral-200/80 overflow-hidden">
        {/* Left: list */}
        <aside
          className={`w-full md:w-[320px] lg:w-[340px] xl:w-[360px] min-h-0 shrink-0 flex-col bg-white ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-neutral-100 bg-neutral-50/50">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  value={search}
                  maxLength={100}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm ticket…"
                  title="Tìm theo số, tên, email hoặc nội dung"
                  aria-label="Tìm ticket"
                  className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs text-neutral-900 placeholder:text-neutral-400 outline-none transition shadow-2xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Xoá từ khoá"
                    className={`absolute right-2 top-2 text-neutral-400 hover:text-neutral-700 rounded ${FOCUS}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isAdmin && sites.length > 1 && (
                <div className="w-[132px] shrink-0">
                  <Select
                    size="sm"
                    options={siteOptions}
                    value={siteId}
                    onChange={setSiteId}
                    aria-label="Lọc theo website"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-neutral-100/90">
            {items.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-3 border border-neutral-200/60 shadow-2xs">
                  {loadingList ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <LifeBuoy className="w-6 h-6" />
                  )}
                </div>
                <p className="text-xs font-semibold text-neutral-900">
                  {loadingList
                    ? "Đang tải ticket…"
                    : filtering
                      ? "Không có ticket phù hợp"
                      : isAdmin
                        ? "Chưa có ticket nào"
                        : "Chưa có ticket nào được giao cho bạn."}
                </p>
                {!loadingList && (
                  <p className="text-[11px] text-neutral-500 mt-1 max-w-[220px] mx-auto leading-relaxed">
                    {filtering
                      ? "Hãy kiểm tra lại từ khóa hoặc xóa bộ lọc."
                      : isAdmin
                        ? "Khi khách gửi yêu cầu lúc không có ai trực, ticket sẽ xuất hiện tại đây."
                        : "Quản trị viên sẽ giao ticket cho bạn khi cần."}
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {items.map((ticket) => {
                  const active = ticket.id === selectedId;
                  const mine = ticket.assignee?.id === currentUser.id;
                  const label = ticketLabel(ticket);
                  const fresh = ticket.status === "new";
                  return (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => selectTicket(ticket)}
                        aria-current={active}
                        className={`w-full text-left p-3 sm:px-3.5 transition-colors cursor-pointer flex items-start gap-3 border-l-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/50 ${
                          active
                            ? "bg-amber-50/80 border-l-amber-600 shadow-2xs"
                            : "border-l-transparent hover:bg-neutral-50/80"
                        }`}
                      >
                        <Avatar label={label} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span
                              className={`text-xs truncate ${
                                fresh ? "font-bold text-neutral-900" : "font-semibold text-neutral-800"
                              }`}
                            >
                              {label}
                            </span>
                            <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-medium tabular-nums">
                              <span className="text-neutral-300">#{ticket.number}</span>
                              {/* Relative to "now", which differs between SSR and hydration. */}
                              <span className="text-neutral-400" suppressHydrationWarning>
                                {formatRelative(ticket.createdAt)}
                              </span>
                            </span>
                          </div>

                          <p className="text-[11px] text-neutral-500 truncate mb-1.5 leading-snug">
                            {ticket.message}
                          </p>

                          <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden">
                            {ticket.siteName && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-neutral-600 bg-neutral-100 border border-neutral-200/60 px-1.5 py-0.5 rounded shadow-2xs whitespace-nowrap min-w-0 max-w-[120px]">
                                <Globe className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                                <span className="truncate">{ticket.siteName}</span>
                              </span>
                            )}
                            <StatusPill status={ticket.status} />
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap min-w-0 max-w-[110px] ${
                                ticket.assignee
                                  ? mine
                                    ? ASSIGNED_MINE
                                    : "bg-neutral-100 text-neutral-700 border-neutral-200/60"
                                  : "bg-white text-neutral-400 border-neutral-200/60"
                              }`}
                            >
                              <UserIcon className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">
                                {ticket.assignee ? (mine ? "Của tôi" : ticket.assignee.name) : "Chưa giao"}
                              </span>
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {items.length > 0 && items.length < total && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingList}
                  className={`w-full py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition cursor-pointer shadow-2xs ${FOCUS}`}
                >
                  {loadingList ? "Đang tải…" : "Xem thêm ticket"}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Right: detail */}
        <section
          className={`flex-1 min-w-0 min-h-0 overflow-hidden flex-col bg-white ${
            selectedId ? "flex" : "hidden md:flex"
          }`}
        >
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F8F9FA]">
              <div className="w-14 h-14 rounded-2xl bg-white border border-neutral-200 text-neutral-400 flex items-center justify-center mb-3 shadow-xs">
                <LifeBuoy className="w-7 h-7 text-neutral-400" />
              </div>
              <h2 className="text-sm font-semibold text-neutral-900">Chọn một ticket</h2>
              <p className="text-xs text-neutral-500 mt-1 max-w-xs leading-relaxed">
                Chọn một ticket từ danh sách bên trái để xem yêu cầu của khách và trả lời.
              </p>
            </div>
          ) : !selected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3 bg-[#F8F9FA]">
              {loadingDetail ? (
                <div className="inline-flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  Đang tải ticket…
                </div>
              ) : (
                <p className="text-xs text-rose-700">{detailError ?? "Không tìm thấy ticket."}</p>
              )}
              <button
                type="button"
                onClick={() => selectTicket(null)}
                className={`text-xs text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 cursor-pointer rounded ${FOCUS}`}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Quay lại danh sách
              </button>
            </div>
          ) : (
            <TicketDetail
              key={selected.id}
              ticket={selected}
              isAdmin={isAdmin}
              canAct={isAdmin || selected.assignee?.id === currentUser.id}
              staff={staff}
              detailError={detailError}
              onBack={() => selectTicket(null)}
              onUpdated={applyTicket}
              onChanged={refreshList}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function TicketDetail({
  ticket,
  isAdmin,
  canAct,
  staff,
  detailError,
  onBack,
  onUpdated,
  onChanged,
}: {
  ticket: TicketView;
  isAdmin: boolean;
  canAct: boolean;
  staff: TicketStaff[];
  detailError: string | null;
  onBack: () => void;
  onUpdated: (ticket: TicketView) => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<"assign" | "status" | "reply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const uploads = useAttachmentUploads(ticket.siteId);
  const { isDragging, dropProps } = useImageDrop(uploads.addFiles, { disabled: pending !== null });
  // pending only updates on the next render; this blocks a second Ctrl+Enter before that.
  const sendingRef = useRef(false);

  const mutate = async (
    kind: "assign" | "status" | "reply",
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
  ): Promise<boolean> => {
    setPending(kind);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(await readError(response));
        return false;
      }
      onUpdated((await response.json()) as TicketView);
      onChanged();
      return true;
    } catch {
      setError("Không thể kết nối máy chủ.");
      return false;
    } finally {
      setPending(null);
    }
  };

  const base = `/api/tickets/${encodeURIComponent(ticket.id)}`;

  // Keep the current assignee selectable even if they are not in the staff list.
  const staffOptions =
    ticket.assignee && !staff.some((member) => member.id === ticket.assignee?.id)
      ? [...staff, { id: ticket.assignee.id, name: ticket.assignee.name, email: "" }]
      : staff;

  const sendReply = async () => {
    const body = reply.trim();
    const attachmentIds = uploads.ids;
    if (pending !== null || sendingRef.current) return;
    if (uploads.busy || uploads.hasErrors || (!body && attachmentIds.length === 0) || body.length > 4000) return;
    const payload = attachmentIds.length ? { body, attachmentIds } : { body };
    sendingRef.current = true;
    try {
      if (await mutate("reply", `${base}/replies`, "POST", payload)) {
        setReply("");
        uploads.removeSent(attachmentIds);
      }
    } finally {
      sendingRef.current = false;
    }
  };
  const canSendReply =
    pending === null &&
    !uploads.busy &&
    !uploads.hasErrors &&
    (reply.trim().length > 0 || uploads.ids.length > 0);

  const label = ticketLabel(ticket);
  const next = NEXT_STEP[ticket.status];
  const NextIcon = next.icon;
  const chatHref = `/inbox?conversation=${encodeURIComponent(ticket.conversationId)}`;
  const currentAssigneeId = ticket.assignee?.id ?? "";

  const assigneeOptions: SelectOption[] = [
    { value: "", label: "Chưa giao" },
    ...staffOptions.map((member) => ({
      value: member.id,
      label: member.name,
      hint: member.email || undefined,
    })),
  ];

  const changeAssignee = (value: string) => {
    if (value === currentAssigneeId) return;
    void mutate("assign", `${base}/assign`, "POST", { agentId: value || null });
  };

  // `full`: stretch to the info panel's width; otherwise a compact size for the strip.
  const assigneeControl = (full: boolean) => isAdmin ? (
    <div className={`flex items-center gap-2 min-w-0 ${full ? "w-full" : ""}`}>
      <div className={full ? "flex-1 min-w-0 [&>div]:w-full" : "w-[200px] max-w-full"}>
        <Select
          size="sm"
          options={assigneeOptions}
          value={currentAssigneeId}
          onChange={changeAssignee}
          disabled={pending !== null}
          aria-label="Giao ticket cho"
        />
      </div>
      {pending === "assign" && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />}
    </div>
  ) : (
    <span className="text-xs font-medium text-neutral-800 truncate">
      {ticket.assignee?.name ?? "Chưa giao"}
    </span>
  );

  const statusControl = (full: boolean) => canAct ? (
    <div
      role="group"
      aria-label="Trạng thái ticket"
      className={`items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200/60 shadow-2xs ${
        full ? "flex w-full" : "inline-flex"
      }`}
    >
      {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((status) => {
        const active = ticket.status === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            disabled={pending !== null || active}
            onClick={() => void mutate("status", base, "PATCH", { status })}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap disabled:cursor-default ${
              full ? "flex-1 text-center" : ""
            } ${FOCUS} ${
              active
                ? "bg-white text-neutral-900 shadow-xs font-semibold"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 disabled:opacity-60"
            }`}
          >
            {active && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />}
            {STATUS_LABEL[status]}
          </button>
        );
      })}
    </div>
  ) : (
    <StatusPill status={ticket.status} round />
  );

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Main column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <header className="h-14 px-3 sm:px-5 bg-white border-b border-amber-200/80 shadow-2xs flex items-center justify-between gap-2.5 shrink-0 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Quay lại danh sách"
              title="Quay lại danh sách"
              className={`md:hidden p-1.5 -ml-1 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-black/5 ${FOCUS}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <Avatar label={label} />

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-xs sm:text-sm font-semibold tracking-tight text-neutral-900 truncate">
                  <span className="text-neutral-400 tabular-nums mr-1">#{ticket.number}</span>
                  {label}
                </h2>
                <StatusPill status={ticket.status} round />
              </div>
              <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                {ticket.siteName || ticket.email}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {canAct && (
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void mutate("status", base, "PATCH", { status: next.status })}
                aria-label={next.label}
                title={next.label}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition cursor-pointer whitespace-nowrap ${PRIMARY_BUTTON} ${FOCUS}`}
              >
                {pending === "status" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <NextIcon className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{next.label}</span>
              </button>
            )}
            <Link
              href={chatHref}
              aria-label="Mở cuộc chat"
              title="Mở cuộc chat"
              className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${ACTION_BUTTON} ${FOCUS}`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mở cuộc chat</span>
            </Link>
          </div>
        </header>

        {/* Below xl the info panel is hidden, so its controls sit here. */}
        <div className="xl:hidden shrink-0 px-4 py-2 border-b border-amber-200/60 bg-white flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 min-w-0 max-w-full">
            <span className="text-[11px] text-neutral-500 whitespace-nowrap">Giao cho</span>
            {assigneeControl(false)}
          </div>
          {canAct && (
            <div className="inline-flex items-center gap-2 min-w-0 max-w-full">
              <span className="text-[11px] text-neutral-500 whitespace-nowrap">Trạng thái</span>
              <div className={`min-w-0 overflow-x-auto ${HIDE_SCROLLBAR}`}>{statusControl(false)}</div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-[#FFFDF9]">
          <div className="max-w-3xl px-4 sm:px-6 py-5 space-y-4">
            {(error || detailError) && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 flex items-center justify-between gap-2"
              >
                <span>{error ?? detailError}</span>
                {error && (
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    aria-label="Đóng thông báo lỗi"
                    className={`text-rose-500 hover:text-rose-800 rounded ${FOCUS}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Original request, shown as the visitor's message. */}
            <div className="flex justify-start">
              <div className="max-w-[90%] sm:max-w-[80%] min-w-0">
                <div className="mb-1 px-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="font-medium text-neutral-700">{ticket.name || "Khách"}</span>
                  <a
                    href={`mailto:${ticket.email}`}
                    className={`text-neutral-500 hover:text-amber-800 hover:underline break-all rounded ${FOCUS}`}
                  >
                    {ticket.email}
                  </a>
                  <span className="text-[10px] text-neutral-400 tabular-nums">
                    {formatDateTime(ticket.createdAt)}
                  </span>
                </div>
                <div className="bg-white border border-amber-200/80 text-neutral-800 rounded-2xl rounded-tl-sm shadow-xs px-3.5 py-2.5">
                  <div className="text-[10px] font-semibold text-amber-800 mb-1">
                    Yêu cầu #{ticket.number}
                  </div>
                  <MessageAttachments attachments={ticket.attachments} tone="visitor" className="mb-1.5" />
                  <p className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {ticket.message}
                  </p>
                </div>
              </div>
            </div>

            {ticket.replies.length === 0 ? (
              <p className="text-[11px] text-neutral-400 px-1">
                Chưa có trả lời. Câu trả lời sẽ hiện trong khung chat của khách và được gửi qua email.
              </p>
            ) : (
              ticket.replies.map((item, index) => (
                <div key={`${item.createdAt}-${index}`} className="flex justify-end">
                  <div className="max-w-[90%] sm:max-w-[80%] min-w-0 flex flex-col items-end">
                    <div className="bg-gradient-to-br from-[#EA580C] to-[#F59E0B] text-white rounded-2xl rounded-tr-sm shadow-sm shadow-amber-600/20 px-3.5 py-2.5">
                      <MessageAttachments
                        attachments={item.attachments}
                        tone="agent"
                        className={item.body ? "mb-1.5" : ""}
                      />
                      {item.body && (
                        <p className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                          {item.body}
                        </p>
                      )}
                    </div>
                    <div className="mt-1 px-1 flex items-center gap-2 text-[10px]">
                      <span className="font-semibold text-[#EA580C]">{item.authorName}</span>
                      <span className="text-neutral-400 tabular-nums">{formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {canAct && (
          <div className="shrink-0 border-t border-amber-200/80 bg-[#FFFDF9] p-3">
            {ticket.status === "done" && (
              <p className="text-[11px] text-neutral-500 mb-2 px-0.5 truncate">
                Ticket đã xong. Trả lời vẫn được gửi cho khách.
              </p>
            )}
            <div
              {...dropProps}
              className={`flex flex-col rounded-xl border bg-white focus-within:border-amber-500 focus-within:ring-3 focus-within:ring-amber-500/15 shadow-sm transition-all ${
                isDragging ? "border-amber-500 ring-3 ring-amber-500/25 bg-amber-50/60" : "border-amber-300/80"
              }`}
            >
              <AttachmentTray
                items={uploads.items}
                onRemove={uploads.remove}
                onRetry={uploads.retry}
                notice={uploads.notice}
                onDismissNotice={uploads.dismissNotice}
              />
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onPaste={(e) => {
                  if (pending === null) handleImagePaste(e, uploads.addFiles);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void sendReply();
                  }
                }}
                maxLength={4000}
                rows={2}
                placeholder="Nhập trả lời cho khách…"
                aria-label="Nội dung trả lời"
                className="w-full resize-none min-h-[64px] max-h-48 px-3.5 pt-3 pb-2 outline-none leading-relaxed text-xs sm:text-[13px] rounded-t-[inherit] bg-transparent text-neutral-800 placeholder:text-neutral-400"
              />
              <div className="px-3 py-2 flex items-center justify-between gap-2 rounded-b-[inherit] border-t border-amber-200/60 bg-amber-50/70 text-amber-950">
                <AttachButton onFiles={uploads.addFiles} disabled={pending !== null} />
                <p className="hidden sm:block text-[11px] text-amber-900/70 min-w-0 truncate">
                  Ctrl+Enter để gửi. Khách nhận qua chat và email.
                </p>
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={!canSendReply}
                  title={
                    uploads.busy
                      ? "Đang tải ảnh lên…"
                      : uploads.hasErrors
                        ? ATTACHMENT_ERRORS.retryHint
                        : undefined
                  }
                  className={`ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer ${PRIMARY_BUTTON} ${FOCUS}`}
                >
                  {pending === "reply" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Gửi trả lời
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: info panel */}
      <aside className="hidden xl:flex w-[300px] shrink-0 flex-col border-l border-neutral-200/80 bg-white overflow-y-auto">
        <section className="p-4 border-b border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 mb-3">Khách hàng</h3>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar label={label} size="lg" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-900 truncate">{ticket.name || "Khách"}</div>
              <a
                href={`mailto:${ticket.email}`}
                className={`block text-[11px] text-neutral-500 hover:text-amber-800 hover:underline truncate rounded ${FOCUS}`}
              >
                {ticket.email}
              </a>
            </div>
          </div>
          <Link
            href={chatHref}
            className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#EA580C] hover:underline rounded ${FOCUS}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Mở cuộc chat
          </Link>
        </section>

        <section className="p-4 border-b border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2">Website</h3>
          <div className="inline-flex items-center gap-1.5 text-xs text-neutral-700 min-w-0">
            <Globe className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="truncate">{ticket.siteName || "Không rõ"}</span>
          </div>
        </section>

        <section className="p-4 border-b border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2">Giao cho</h3>
          {assigneeControl(true)}
        </section>

        <section className="p-4 border-b border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2">Trạng thái</h3>
          {statusControl(true)}
        </section>

        <section className="p-4 border-b border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2">Thời gian</h3>
          <dl className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-500">Gửi lúc</dt>
              <dd className="text-neutral-800 tabular-nums">{formatDateTime(ticket.createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-500">Cập nhật</dt>
              <dd className="text-neutral-800 tabular-nums">{formatDateTime(ticket.updatedAt)}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
