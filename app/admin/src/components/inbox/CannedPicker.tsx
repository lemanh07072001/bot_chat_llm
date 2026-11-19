"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CornerDownLeft,
  ExternalLink,
  Layers,
  Search,
  Settings2,
  Sparkles,
  User,
  X,
} from "lucide-react";
import {
  cannedGroups,
  searchCanned,
  type CannedGroup,
  type CannedHit,
  type CannedTemplate,
  type EffectiveCanned,
} from "@/lib/canned";
import type { ChatTheme } from "./chatThemes";

/**
 * Fired by "Quản lý mẫu" so the header opens its account dialog on the right
 * tab. The composer has no way to reach that dialog directly, and passing a
 * callback through four components to open one modal is worse than an event.
 */
export const OPEN_ACCOUNT_PREFERENCES_EVENT = "open-account-preferences";

export function openAccountPreferences() {
  window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_PREFERENCES_EVENT));
}

/**
 * Loads the shared and project sets for one project.
 *
 * A failure is not fatal: the composer still shows the agent's own replies, so
 * the picker degrades to "Của tôi" instead of disappearing.
 */
export function useEffectiveCanned(siteId: string | undefined) {
  const [effective, setEffective] = useState<EffectiveCanned | null>(null);

  useEffect(() => {
    if (!siteId) {
      setEffective(null);
      return;
    }

    const controller = new AbortController();

    void fetch(`/api/canned-responses/effective?siteId=${encodeURIComponent(siteId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as EffectiveCanned;
      })
      .then((data) => {
        if (!controller.signal.aborted) setEffective(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEffective(null);
      });

    return () => controller.abort();
  }, [siteId]);

  return effective;
}

function shortcutBadge(template: CannedTemplate) {
  return template.shortcut ? `/${template.shortcut}` : null;
}

const SCROLL_AREA =
  "overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.15)_transparent] dark:[scrollbar-color:rgba(255,255,255,0.18)_transparent]";

function groupBadge(group: CannedGroup["key"]) {
  switch (group) {
    case "mine":
      return {
        label: "Cá nhân",
        className:
          "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200/70 dark:border-indigo-800/50",
      };
    case "site":
      return {
        label: "Dự án",
        className:
          "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-800/50",
      };
    case "global":
    default:
      return {
        label: "Mẫu chung",
        className:
          "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200/70 dark:border-amber-800/50",
      };
  }
}

function Row({
  hit,
  active,
  onPick,
  onHover,
}: {
  hit: CannedHit;
  active?: boolean;
  onPick: () => void;
  onHover?: () => void;
}) {
  const badge = shortcutBadge(hit);
  const grp = groupBadge(hit.group);

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      // Pointer-down rather than click: textarea caret stays preserved
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      aria-selected={active}
      className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-3 cursor-pointer group ${
        active
          ? "bg-black/[0.06] dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
          : "hover:bg-black/[0.035] dark:hover:bg-white/[0.06]"
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border leading-none shrink-0 ${grp.className}`}
          >
            {grp.label}
          </span>
          {hit.title && (
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-[13px] leading-snug">
              {hit.title}
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400 line-clamp-2 break-words">
          {hit.text}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
        {badge && (
          <span
            title={badge}
            className="rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 font-mono text-[10px] font-semibold leading-none shrink-0 tracking-tight"
          >
            {badge}
          </span>
        )}
        <span
          className={`text-[10px] text-neutral-400 font-medium inline-flex items-center gap-0.5 opacity-0 transition-opacity ${
            active ? "opacity-100" : "group-hover:opacity-80"
          }`}
        >
          <CornerDownLeft className="w-2.5 h-2.5" />
          Chèn
        </span>
      </div>
    </button>
  );
}

/**
 * The suggestion list that opens when typing `/`.
 *
 * Rendered floating right above the composer box with high z-index and elevation.
 */
export function CannedSuggestions({
  hits,
  activeIndex,
  onPick,
  onHover,
  theme,
}: {
  hits: CannedHit[];
  activeIndex: number;
  onPick: (template: CannedTemplate) => void;
  onHover: (index: number) => void;
  theme?: ChatTheme;
}) {
  return (
    <div className="w-[min(26rem,calc(100vw-2rem))] flex flex-col overflow-hidden rounded-2xl bg-white/95 dark:bg-[#181B24]/95 backdrop-blur-xl border border-neutral-200/90 dark:border-white/15 shadow-2xl shadow-neutral-900/15 dark:shadow-black/60 text-neutral-900 dark:text-neutral-100">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-black/5 dark:border-white/10 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1.5">
          <Sparkles className={`w-3.5 h-3.5 ${theme?.uiAccent?.icon ?? "text-amber-500"}`} />
          Gợi ý mẫu câu
        </span>
        <span className="text-[10px] opacity-75 font-mono">
          ↑↓ chọn · ↵ chèn · Esc đóng
        </span>
      </div>

      {/* Suggestion Rows */}
      <div className={`max-h-56 p-1.5 space-y-0.5 ${SCROLL_AREA}`}>
        {hits.length === 0 ? (
          <p className="px-3 py-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
            Không tìm thấy mẫu câu khớp với lệnh này.
          </p>
        ) : (
          hits.map((hit, index) => (
            <Row
              key={`${hit.group}-${hit.shortcut ?? hit.text.slice(0, 12)}-${index}`}
              hit={hit}
              active={index === activeIndex}
              onHover={() => onHover(index)}
              onPick={() => onPick(hit)}
            />
          ))
        )}
      </div>
    </div>
  );
}

type TabKey = "all" | "mine" | "site" | "global";

/**
 * The "Mẫu câu" popover.
 *
 * Full-featured Quick Replies command palette:
 * - Realtime search across shortcut, title and text
 * - Category tabs (Tất cả, Cá nhân, Dự án, Mẫu chung)
 * - Keyboard navigation (Arrow keys, Enter, Esc)
 * - Direct link to template manager
 */
export function CannedPickerPanel({
  personal,
  effective,
  siteName,
  onPick,
  onClose,
  canManageSite,
  theme,
}: {
  personal: CannedTemplate[];
  effective: EffectiveCanned | null;
  siteName?: string;
  onPick: (template: CannedTemplate) => void;
  onClose: () => void;
  canManageSite: boolean;
  theme?: ChatTheme;
}) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const groups = useMemo(
    () => cannedGroups({ personal, effective, siteName }),
    [personal, effective, siteName],
  );

  const totalMine = groups.find((g) => g.key === "mine")?.templates.length ?? 0;
  const totalSite = groups.find((g) => g.key === "site")?.templates.length ?? 0;
  const totalGlobal = groups.find((g) => g.key === "global")?.templates.length ?? 0;
  const total = groups.reduce((sum, group) => sum + group.templates.length, 0);

  // Filter groups according to active tab
  const activeGroups = useMemo(() => {
    if (activeTab === "all") return groups;
    return groups.filter((g) => g.key === activeTab);
  }, [groups, activeTab]);

  // Search within selected tab's groups
  const filteredHits: CannedHit[] = useMemo(() => {
    return searchCanned(activeGroups, query);
  }, [activeGroups, query]);

  // Keep active index in bounds
  useEffect(() => {
    setActiveIndex(0);
  }, [query, activeTab]);

  // Keyboard navigation inside the picker
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredHits.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredHits.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredHits.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filteredHits.length) % filteredHits.length);
      }
      return;
    }

    if (event.key === "Enter") {
      if (filteredHits.length > 0 && filteredHits[activeIndex]) {
        event.preventDefault();
        onPick(filteredHits[activeIndex]);
      }
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="w-[min(28rem,calc(100vw-2rem))] flex flex-col overflow-hidden rounded-2xl bg-white/95 dark:bg-[#161922]/95 backdrop-blur-xl border border-neutral-200/90 dark:border-white/15 shadow-2xl shadow-neutral-900/15 dark:shadow-black/70 text-neutral-900 dark:text-neutral-100"
    >
      {/* Header */}
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between border-b border-black/5 dark:border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-semibold flex items-center gap-1.5">
              Mẫu câu trả lời nhanh
              {total > 0 && (
                <span className="rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.2 text-[10px] font-semibold opacity-70">
                  {total}
                </span>
              )}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Đóng (Esc)"
          className="rounded-lg p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Category Tabs */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === "all"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"
          }`}
        >
          <span>Tất cả</span>
          <span className="text-[10px] opacity-75 font-mono">{total}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mine")}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === "mine"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"
          }`}
        >
          <User className="w-3 h-3" />
          <span>Của tôi</span>
          <span className="text-[10px] opacity-75 font-mono">{totalMine}</span>
        </button>

        {totalSite > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("site")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === "site"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span className="truncate max-w-[6rem]">{siteName ? `Dự án` : "Dự án"}</span>
            <span className="text-[10px] opacity-75 font-mono">{totalSite}</span>
          </button>
        )}

        {totalGlobal > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("global")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === "global"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <span>Chung</span>
            <span className="text-[10px] opacity-75 font-mono">{totalGlobal}</span>
          </button>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="px-3 py-1.5">
        <label className="flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-white/15 bg-neutral-50/80 dark:bg-white/[0.04] px-2.5 py-1.5 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/15 transition-all">
          <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo phím tắt (vd: /dat-banh), tiêu đề hoặc nội dung…"
            aria-label="Tìm mẫu câu"
            className="w-full bg-transparent text-xs text-neutral-900 dark:text-neutral-100 outline-none placeholder:text-neutral-400"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-1.5 py-0.2 rounded border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[10px] font-mono text-neutral-400">
              /
            </kbd>
          )}
        </label>
      </div>

      {/* Templates List */}
      <div className={`max-h-72 border-t border-black/5 dark:border-white/10 p-1.5 space-y-0.5 ${SCROLL_AREA}`}>
        {total === 0 && (
          <div className="px-3 py-8 text-center text-xs text-neutral-500 space-y-1">
            <Sparkles className="w-5 h-5 mx-auto opacity-40 mb-1" />
            <p className="font-medium text-neutral-700 dark:text-neutral-300">Chưa có mẫu câu nào</p>
            <p className="text-[11px] opacity-75">Bấm &quot;Quản lý mẫu&quot; bên dưới để tạo mẫu đầu tiên của bạn.</p>
          </div>
        )}

        {total > 0 && filteredHits.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-neutral-500 space-y-2">
            <p className="text-neutral-600 dark:text-neutral-400">
              Không tìm thấy mẫu câu khớp với &ldquo;<span className="font-semibold text-neutral-800 dark:text-neutral-200">{query}</span>&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-black/5 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer transition"
            >
              Xóa tìm kiếm
            </button>
          </div>
        )}

        {filteredHits.map((hit, index) => (
          <Row
            key={`${hit.group}-${hit.shortcut ?? hit.text.slice(0, 12)}-${index}`}
            hit={hit}
            active={index === activeIndex}
            onHover={() => setActiveIndex(index)}
            onPick={() => onPick(hit)}
          />
        ))}
      </div>

      {/* Footer Navigation & Settings */}
      <div className="px-3 py-2 border-t border-black/5 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] flex items-center justify-between gap-2 text-xs">
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400 inline-flex items-center gap-1 whitespace-nowrap">
          <CornerDownLeft className="w-3 h-3 opacity-70" />
          Gõ <kbd className="font-mono text-[10px] px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 font-bold">/</kbd> để chèn nhanh
        </span>

        <div className="flex items-center gap-1.5">
          {canManageSite && (
            <a
              href="/channels/widget"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3" />
              Mẫu dự án
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              openAccountPreferences();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition cursor-pointer whitespace-nowrap shadow-2xs"
          >
            <Settings2 className="w-3 h-3" />
            Quản lý mẫu
          </button>
        </div>
      </div>
    </div>
  );
}