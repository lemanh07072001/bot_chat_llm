"use client";

import { useEffect, useMemo, useState } from "react";
import { CornerDownLeft, Search, Settings2, Sparkles } from "lucide-react";
import {
  cannedGroups,
  searchCanned,
  type CannedGroup,
  type CannedHit,
  type CannedTemplate,
  type EffectiveCanned,
} from "@/lib/canned";

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
  "overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent] dark:[scrollbar-color:rgba(255,255,255,0.18)_transparent]";

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

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      // Pointer-down rather than click: the textarea loses focus on mousedown
      // and the caret position is gone by the time a click would land.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      aria-selected={active}
      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors flex items-start gap-3 cursor-pointer ${
        active ? "bg-black/[0.06] dark:bg-white/10" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.07]"
      }`}
    >
      <span className="min-w-0 flex-1 space-y-0.5">
        {hit.title ? (
          <>
            <span className="block font-medium leading-5 truncate">{hit.title}</span>
            <span className="block leading-4 text-[11px] text-slate-500 dark:text-neutral-400 line-clamp-2 break-words">
              {hit.text}
            </span>
          </>
        ) : (
          <span className="block leading-5 line-clamp-2 break-words">{hit.text}</span>
        )}
      </span>
      {badge && (
        <span
          title={badge}
          className="shrink-0 max-w-[7.5rem] truncate rounded-md border border-black/5 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] leading-4 text-slate-500 dark:text-neutral-400"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * The suggestion list that opens on `/`.
 *
 * Rendered inside the composer box rather than in a portal: it must never be
 * clipped by the message column and it has to scroll with the input.
 */
export function CannedSuggestions({
  hits,
  activeIndex,
  onPick,
  onHover,
}: {
  hits: CannedHit[];
  activeIndex: number;
  onPick: (template: CannedTemplate) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div className="border-b border-black/5 dark:border-white/10 bg-white/60 dark:bg-transparent">
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide opacity-50">
        <Sparkles className="w-3 h-3" />
        Mẫu câu · ↑↓ chọn · Enter chèn · Esc đóng
      </div>
      <div className={`max-h-52 px-1.5 pb-1.5 ${SCROLL_AREA}`}>
        {hits.length === 0 ? (
          <p className="px-2 py-1.5 text-xs opacity-60">Không có mẫu câu khớp.</p>
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

/**
 * The "Mẫu câu" popover.
 *
 * Search sits above the groups rather than replacing them, so an agent who
 * knows the list simply scrolls, and one who does not can type three letters.
 */
export function CannedPickerPanel({
  personal,
  effective,
  siteName,
  onPick,
  onClose,
  canManageSite,
}: {
  personal: CannedTemplate[];
  effective: EffectiveCanned | null;
  siteName?: string;
  onPick: (template: CannedTemplate) => void;
  onClose: () => void;
  canManageSite: boolean;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => cannedGroups({ personal, effective, siteName }),
    [personal, effective, siteName],
  );

  const visible: CannedGroup[] = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          templates: searchCanned([group], query).map(({ group: _g, groupLabel: _l, ...rest }) => rest),
        }))
        .filter((group) => group.templates.length > 0),
    [groups, query],
  );

  const total = groups.reduce((sum, group) => sum + group.templates.length, 0);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[min(24rem,calc(100vw-2rem))] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#161922] border border-neutral-200 dark:border-white/15 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-neutral-100">
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 opacity-80" />
          Mẫu câu trả lời nhanh
          {total > 0 && (
            <span className="ml-0.5 rounded-full bg-black/5 dark:bg-white/10 px-1.5 text-[10px] font-medium opacity-70">
              {total}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-black/5 dark:border-white/10 px-1.5 py-0.5 font-mono text-[10px] opacity-60 hover:opacity-100 cursor-pointer transition"
        >
          Esc
        </button>
      </div>

      <label className="flex items-center gap-2 mx-3 mb-2 rounded-xl border border-neutral-200 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03] px-2.5 py-1.5 focus-within:border-slate-400 dark:focus-within:border-white/30 transition-colors">
        <Search className="w-3.5 h-3.5 opacity-50 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="Tìm theo phím tắt, tiêu đề hoặc nội dung…"
          aria-label="Tìm mẫu câu"
          className="w-full bg-transparent text-xs outline-none placeholder:opacity-50"
        />
      </label>

      <div className={`max-h-72 border-t border-neutral-100 dark:border-white/10 px-1.5 pb-2 ${SCROLL_AREA}`}>
        {total === 0 && (
          <p className="px-2.5 py-4 text-center text-xs opacity-60">Chưa có mẫu câu nào.</p>
        )}

        {total > 0 && visible.length === 0 && (
          <p className="px-2.5 py-4 text-center text-xs opacity-60">Không có mẫu câu khớp “{query}”.</p>
        )}

        {visible.map((group) => (
          <div key={group.key}>
            <p className="sticky top-0 z-10 bg-white dark:bg-[#161922] px-2.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
              {group.label}
            </p>
            {group.templates.map((template, index) => (
              <Row
                key={`${group.key}-${template.shortcut ?? index}`}
                hit={{ ...template, group: group.key, groupLabel: group.label }}
                onPick={() => onPick(template)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="px-2.5 py-2 border-t border-neutral-100 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between gap-2">
        <span className="px-1 text-[10px] opacity-50 inline-flex items-center gap-1 whitespace-nowrap">
          <CornerDownLeft className="w-3 h-3" />
          Gõ <kbd className="font-mono">/</kbd> để chèn nhanh
        </span>
        <div className="flex items-center gap-1">
          {canManageSite && (
            <a
              href="/channels/widget"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer whitespace-nowrap"
            >
              Mẫu dự án
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              openAccountPreferences();
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer whitespace-nowrap"
          >
            <Settings2 className="w-3 h-3" />
            Quản lý mẫu
          </button>
        </div>
      </div>
    </div>
  );
}
