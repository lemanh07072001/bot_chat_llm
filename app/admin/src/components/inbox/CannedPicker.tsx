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
  "overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.15)_transparent]";

/**
 * Resolves theme-synchronized colors and surfaces.
 *
 * Avoids raw OS-level `dark:` classes that would clash when a light theme
 * (such as Front Amber / Sunset Warmth) is running on a dark-mode OS.
 */
export function getThemeStyles(theme?: ChatTheme) {
  const isDark = theme
    ? theme.category === "dark" || theme.category === "futuristic"
    : false;
  const isAmber = theme?.id === "front-amber" || (!isDark && theme?.palette?.primary === "#EA580C");

  if (isAmber) {
    return {
      isDark: false,
      panelBg: "bg-[#FFFDF9] border border-amber-300/90 text-neutral-850 shadow-2xl shadow-amber-950/15 ring-1 ring-amber-400/25",
      headerBg: "bg-amber-50/90 border-b border-amber-200/80 text-amber-950",
      footerBg: "bg-amber-50/90 border-t border-amber-200/80 text-amber-900",
      searchBox: "bg-white border border-amber-300/90 text-neutral-900 placeholder:text-neutral-400 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 shadow-2xs",
      activeTab: "bg-gradient-to-r from-[#EA580C] to-[#F59E0B] text-white font-semibold shadow-xs",
      inactiveTab: "text-amber-900/80 hover:bg-amber-100/80 hover:text-amber-950",
      tabsBorder: "border-b border-amber-200/70 bg-amber-50/50",
      rowActive: "bg-amber-100/90 ring-1 ring-amber-400/80 text-neutral-900 shadow-2xs",
      rowHover: "hover:bg-amber-50 text-neutral-800",
      shortcutBadge: "bg-amber-100 text-amber-900 border border-amber-300/90 font-mono font-semibold",
      divider: "border-amber-200/60",
      accentIcon: "text-amber-600",
      kbd: "bg-amber-100 border border-amber-300/90 text-amber-900 font-bold",
      buttonSecondary: "bg-white hover:bg-amber-100 text-amber-950 border border-amber-300/90 shadow-2xs",
      badgeMine: "bg-amber-100/80 text-amber-900 border-amber-300/80",
      badgeSite: "bg-orange-100/80 text-orange-950 border-orange-300/80",
      badgeGlobal: "bg-yellow-100/80 text-yellow-950 border-yellow-300/80",
    };
  }

  if (isDark) {
    return {
      isDark: true,
      panelBg: "bg-[#13161F] border border-white/15 text-neutral-100 shadow-2xl shadow-black/80 ring-1 ring-white/5",
      headerBg: "bg-white/[0.04] border-b border-white/10 text-neutral-100",
      footerBg: "bg-white/[0.03] border-t border-white/10 text-neutral-400",
      searchBox: "bg-white/[0.05] border border-white/10 text-white placeholder:text-neutral-500 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/20 shadow-2xs",
      activeTab: "bg-white text-neutral-950 font-semibold shadow-xs",
      inactiveTab: "text-neutral-400 hover:bg-white/10 hover:text-white",
      tabsBorder: "border-b border-white/5 bg-white/[0.02]",
      rowActive: "bg-white/10 ring-1 ring-white/15 text-white shadow-2xs",
      rowHover: "hover:bg-white/[0.06] text-neutral-200",
      shortcutBadge: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono font-semibold",
      divider: "border-white/10",
      accentIcon: theme?.uiAccent?.icon ?? "text-indigo-400",
      kbd: "bg-white/10 border border-white/15 text-neutral-300",
      buttonSecondary: "bg-white/10 hover:bg-white/15 text-neutral-200 border border-white/10 shadow-2xs",
      badgeMine: "bg-indigo-950/60 text-indigo-400 border-indigo-800/50",
      badgeSite: "bg-emerald-950/60 text-emerald-400 border-emerald-800/50",
      badgeGlobal: "bg-amber-950/60 text-amber-400 border-amber-800/50",
    };
  }

  // General clean light themes
  return {
    isDark: false,
    panelBg: "bg-white border border-neutral-200 text-neutral-800 shadow-2xl shadow-neutral-900/10 ring-1 ring-black/5",
    headerBg: "bg-neutral-50/90 border-b border-neutral-200/80 text-neutral-900",
    footerBg: "bg-neutral-50/90 border-t border-neutral-200/80 text-neutral-600",
    searchBox: "bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus-within:border-slate-800 focus-within:ring-2 focus-within:ring-slate-800/15 shadow-2xs",
    activeTab: "bg-neutral-900 text-white font-semibold shadow-xs",
    inactiveTab: "text-neutral-600 hover:bg-black/5 hover:text-neutral-900",
    tabsBorder: "border-b border-neutral-100 bg-neutral-50/50",
    rowActive: "bg-black/[0.06] ring-1 ring-black/10 text-neutral-900 shadow-2xs",
    rowHover: "hover:bg-black/[0.035] text-neutral-800",
    shortcutBadge: "bg-amber-500/10 text-amber-800 border border-amber-500/20 font-mono font-semibold",
    divider: "border-neutral-100",
    accentIcon: theme?.uiAccent?.icon ?? "text-amber-500",
    kbd: "bg-black/5 border border-black/10 text-neutral-600",
    buttonSecondary: "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-200/80 shadow-2xs",
    badgeMine: "bg-indigo-50 text-indigo-700 border-indigo-200",
    badgeSite: "bg-emerald-50 text-emerald-700 border-emerald-200",
    badgeGlobal: "bg-amber-50 text-amber-700 border-amber-200",
  };
}

function Row({
  hit,
  active,
  onPick,
  onHover,
  styles,
}: {
  hit: CannedHit;
  active?: boolean;
  onPick: () => void;
  onHover?: () => void;
  styles: ReturnType<typeof getThemeStyles>;
}) {
  const badge = shortcutBadge(hit);
  const grpClass =
    hit.group === "mine"
      ? styles.badgeMine
      : hit.group === "site"
      ? styles.badgeSite
      : styles.badgeGlobal;
  const grpLabel =
    hit.group === "mine" ? "Cá nhân" : hit.group === "site" ? "Dự án" : "Mẫu chung";

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      // Pointer-down rather than click: textarea caret stays preserved
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      aria-selected={active}
      className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-3 cursor-pointer group ${
        active ? styles.rowActive : styles.rowHover
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border leading-none shrink-0 ${grpClass}`}
          >
            {grpLabel}
          </span>
          {hit.title && (
            <span
              className={`font-semibold truncate text-[13px] leading-snug ${
                styles.isDark ? "text-neutral-100" : "text-neutral-900"
              }`}
            >
              {hit.title}
            </span>
          )}
        </div>
        <p
          className={`text-[11px] leading-relaxed line-clamp-2 break-words ${
            styles.isDark ? "text-neutral-400" : "text-neutral-600"
          }`}
        >
          {hit.text}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
        {badge && (
          <span
            title={badge}
            className={`rounded-md px-2 py-0.5 text-[10px] leading-none shrink-0 tracking-tight ${styles.shortcutBadge}`}
          >
            {badge}
          </span>
        )}
        <span
          className={`text-[10px] font-medium inline-flex items-center gap-0.5 opacity-0 transition-opacity ${
            styles.isDark ? "text-neutral-400" : "text-neutral-500"
          } ${active ? "opacity-100" : "group-hover:opacity-80"}`}
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
  const styles = getThemeStyles(theme);

  return (
    <div
      className={`w-[min(26rem,calc(100vw-2rem))] flex flex-col overflow-hidden rounded-2xl backdrop-blur-xl ${styles.panelBg}`}
    >
      {/* Header Bar */}
      <div className={`flex items-center justify-between px-3 pt-2.5 pb-1.5 text-[11px] font-medium ${styles.headerBg}`}>
        <span className="flex items-center gap-1.5 font-semibold">
          <Sparkles className={`w-3.5 h-3.5 ${styles.accentIcon}`} />
          Gợi ý mẫu câu
        </span>
        <span className="text-[10px] opacity-75 font-mono">
          ↑↓ chọn · ↵ chèn · Esc đóng
        </span>
      </div>

      {/* Suggestion Rows */}
      <div className={`max-h-56 p-1.5 space-y-0.5 ${SCROLL_AREA}`}>
        {hits.length === 0 ? (
          <p
            className={`px-3 py-3 text-center text-xs ${
              styles.isDark ? "text-neutral-400" : "text-neutral-500"
            }`}
          >
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
              styles={styles}
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
  const styles = getThemeStyles(theme);
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
      className={`w-[min(28rem,calc(100vw-2rem))] flex flex-col overflow-hidden rounded-2xl backdrop-blur-xl ${styles.panelBg}`}
    >
      {/* Header */}
      <div className={`px-3.5 pt-3 pb-2 flex items-center justify-between ${styles.headerBg}`}>
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              styles.isDark ? "bg-white/10" : "bg-amber-100/90 text-amber-700"
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${styles.accentIcon}`} />
          </div>
          <div>
            <span className="text-xs font-semibold flex items-center gap-1.5">
              Mẫu câu trả lời nhanh
              {total > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                    styles.isDark ? "bg-white/15 text-white" : "bg-amber-200/90 text-amber-950 border border-amber-300/60"
                  }`}
                >
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
          className={`rounded-lg p-1 transition cursor-pointer ${
            styles.isDark
              ? "text-neutral-400 hover:text-white hover:bg-white/10"
              : "text-amber-800 hover:text-amber-950 hover:bg-amber-100/80"
          }`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Category Tabs */}
      <div
        className={`px-3 pt-2 pb-1.5 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] ${styles.tabsBorder}`}
      >
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === "all" ? styles.activeTab : styles.inactiveTab
          }`}
        >
          <span>Tất cả</span>
          <span className="text-[10px] opacity-80 font-mono">{total}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mine")}
          className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === "mine" ? styles.activeTab : styles.inactiveTab
          }`}
        >
          <User className="w-3 h-3" />
          <span>Của tôi</span>
          <span className="text-[10px] opacity-80 font-mono">{totalMine}</span>
        </button>

        {totalSite > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("site")}
            className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === "site" ? styles.activeTab : styles.inactiveTab
            }`}
          >
            <Layers className="w-3 h-3" />
            <span className="truncate max-w-[6rem]">{siteName ? `Dự án` : "Dự án"}</span>
            <span className="text-[10px] opacity-80 font-mono">{totalSite}</span>
          </button>
        )}

        {totalGlobal > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("global")}
            className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === "global" ? styles.activeTab : styles.inactiveTab
            }`}
          >
            <span>Chung</span>
            <span className="text-[10px] opacity-80 font-mono">{totalGlobal}</span>
          </button>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="px-3 py-2">
        <label className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-all ${styles.searchBox}`}>
          <Search className="w-3.5 h-3.5 opacity-50 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo phím tắt (vd: /dat-banh), tiêu đề hoặc nội dung…"
            aria-label="Tìm mẫu câu"
            className="w-full bg-transparent text-xs outline-none placeholder:opacity-50"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <kbd className={`hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono border ${styles.kbd}`}>
              /
            </kbd>
          )}
        </label>
      </div>

      {/* Templates List */}
      <div className={`max-h-72 border-t p-1.5 space-y-0.5 ${styles.divider} ${SCROLL_AREA}`}>
        {total === 0 && (
          <div
            className={`px-3 py-8 text-center text-xs space-y-1 ${
              styles.isDark ? "text-neutral-400" : "text-neutral-500"
            }`}
          >
            <Sparkles className="w-5 h-5 mx-auto opacity-40 mb-1" />
            <p className="font-medium text-neutral-800 dark:text-neutral-200">Chưa có mẫu câu nào</p>
            <p className="text-[11px] opacity-75">Bấm &quot;Quản lý mẫu&quot; bên dưới để tạo mẫu đầu tiên của bạn.</p>
          </div>
        )}

        {total > 0 && filteredHits.length === 0 && (
          <div
            className={`px-3 py-8 text-center text-xs space-y-2 ${
              styles.isDark ? "text-neutral-400" : "text-neutral-600"
            }`}
          >
            <p>
              Không tìm thấy mẫu câu khớp với &ldquo;<span className="font-semibold">{query}</span>&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition border ${styles.buttonSecondary}`}
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
            styles={styles}
          />
        ))}
      </div>

      {/* Footer Navigation & Settings */}
      <div className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${styles.footerBg}`}>
        <span className="text-[11px] opacity-80 inline-flex items-center gap-1 whitespace-nowrap">
          <CornerDownLeft className="w-3 h-3 opacity-70" />
          Gõ <kbd className={`font-mono text-[10px] px-1 py-0.2 rounded border font-bold ${styles.kbd}`}>/</kbd> để chèn nhanh
        </span>

        <div className="flex items-center gap-1.5">
          {canManageSite && (
            <a
              href="/channels/widget"
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${styles.inactiveTab}`}
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
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer whitespace-nowrap shadow-2xs ${styles.buttonSecondary}`}
          >
            <Settings2 className="w-3 h-3" />
            Quản lý mẫu
          </button>
        </div>
      </div>
    </div>
  );
}