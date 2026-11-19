"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { ChatTheme } from "./chatThemes";

/** One emoji: glyph, group order, Vietnamese label, and search tags. */
export type EmojiEntry = { e: string; g: number; l: string; t?: string[] };

type EmojiGroup = { order: number; key: string; label: string };

type EmojiData = { groups: EmojiGroup[]; emojis: EmojiEntry[] };

/** The six taps Facebook and Zalo put first. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** A glyph per group, used as the tab icon. */
const GROUP_GLYPHS: Record<string, string> = {
  "smileys-emotion": "😀",
  "people-body": "👋",
  "animals-nature": "🐻",
  "food-drink": "🍔",
  "travel-places": "🏝️",
  activities: "⚽",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

/** The grid is eight wide, so ↑/↓ can step by whole rows. */
const COLUMNS = 8;

const VIEWPORT_MARGIN = 8;

/** Below this the picker stops being usable; better to overflow than to vanish. */
const MIN_PANEL_HEIGHT = 192;

let emojiCache: EmojiData | null = null;
let emojiRequest: Promise<EmojiData> | null = null;

/**
 * The dataset is ~180 KB, so it is fetched the first time a picker opens and
 * kept in the module cache: the second picker pays nothing. A failed fetch
 * clears the cached promise, otherwise one bad deploy would break the picker
 * until a full page reload.
 */
function loadEmojis(): Promise<EmojiData> {
  if (emojiCache) return Promise.resolve(emojiCache);

  if (!emojiRequest) {
    emojiRequest = import("@/lib/emoji-data.json")
      .then((module) => {
        emojiCache = (module.default ?? module) as unknown as EmojiData;
        return emojiCache;
      })
      .catch((error: unknown) => {
        emojiRequest = null;
        throw error;
      });
  }

  return emojiRequest;
}

const RECENT_KEY = "inbox.emoji.recent";
const RECENT_LIMIT = 16;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberEmoji(emoji: string): string[] {
  const next = [emoji, ...readRecent().filter((item) => item !== emoji)].slice(0, RECENT_LIMIT);

  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A browser with storage disabled still gets the picker, just no history.
  }

  return next;
}

/** Searching should work without Vietnamese diacritics ("cuoi" finds "cười"). */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

function isDarkTheme(theme: ChatTheme): boolean {
  return theme.category === "dark" || theme.category === "futuristic";
}

function panelClass(theme: ChatTheme): string {
  if (theme.id === "front-amber") {
    return "bg-[#FFFDF9] border-amber-300/90 text-neutral-800 shadow-amber-950/20 ring-1 ring-amber-400/25";
  }

  if (isDarkTheme(theme)) {
    return "bg-[#13161F] border-white/15 text-neutral-100 shadow-black/70";
  }

  return "bg-white border-neutral-200 text-neutral-800 shadow-neutral-900/15";
}

function stickyClass(theme: ChatTheme): string {
  if (theme.id === "front-amber") return "bg-[#FFFDF9]/95 text-amber-900/70";
  if (isDarkTheme(theme)) return "bg-[#13161F]/95 text-white/55";
  return "bg-white/95 text-neutral-500";
}

function hoverClass(theme: ChatTheme): string {
  if (theme.id === "front-amber") return "hover:bg-amber-100";
  if (isDarkTheme(theme)) return "hover:bg-white/10";
  return "hover:bg-black/5";
}

function fieldClass(theme: ChatTheme): string {
  if (theme.id === "front-amber") return "border-amber-300/80 bg-amber-50/60";
  if (isDarkTheme(theme)) return "border-white/15 bg-white/5";
  return "border-neutral-200 bg-neutral-50/80";
}

export function EmojiPickerPanel({
  theme,
  quick,
  onPick,
  onClose,
  className = "",
  maxHeight,
}: {
  theme: ChatTheme;
  /** A short row above the search box — the composer's most-used glyphs. */
  quick?: readonly string[];
  onPick: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
  /** Pixel clamp for cramped viewports; the grid shrinks to fit. */
  maxHeight?: number | null;
}) {
  const [data, setData] = useState<EmojiData | null>(emojiCache);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  /** -1 shows every group with its heading; a group order shows just that one. */
  const [tab, setTab] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Captured before the search box grabs focus, so this is the real opener.
    const opener = document.activeElement as HTMLElement | null;
    // Read now: the ref is already null by the time cleanup runs on unmount.
    const panel = rootRef.current;

    setRecent(readRecent());
    inputRef.current?.focus();

    let alive = true;
    void loadEmojis()
      .then((loaded) => {
        if (alive) setData(loaded);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;

      // Only hand focus back when it sat inside the panel being removed; a click
      // on the textarea or another button must keep its own focus.
      const active = document.activeElement;
      const inside = active instanceof Node && (panel?.contains(active) ?? false);
      if (inside && opener && document.contains(opener)) opener.focus();
    };
  }, []);

  // The haystack is built once per dataset, not once per keystroke.
  const index = useMemo(
    () =>
      (data?.emojis ?? []).map((entry) => ({
        entry,
        haystack: normalize([entry.l, ...(entry.t ?? [])].join(" ")),
      })),
    [data],
  );

  const results = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return [];

    const words = needle.split(/\s+/).filter(Boolean);

    return index
      .filter((row) => words.every((word) => row.haystack.includes(word)))
      .slice(0, 240)
      .map((row) => row.entry);
  }, [index, query]);

  const byGroup = useMemo(() => {
    const map = new Map<number, EmojiEntry[]>();
    for (const entry of data?.emojis ?? []) {
      const bucket = map.get(entry.g);
      if (bucket) bucket.push(entry);
      else map.set(entry.g, [entry]);
    }
    return map;
  }, [data]);

  const groups = data?.groups ?? [];

  const pick = (emoji: string) => {
    setRecent(rememberEmoji(emoji));
    onPick(emoji);
  };

  const goToGroup = (order: number) => {
    setQuery("");
    setTab(order);

    requestAnimationFrame(() => {
      const container = listRef.current;
      const section = sectionRefs.current[order];
      if (!container || !section) {
        container?.scrollTo({ top: 0 });
        return;
      }
      container.scrollTo({ top: section.offsetTop, behavior: "smooth" });
    });
  };

  /** Arrow keys walk the grid; a picker nobody can reach with keys is half a picker. */
  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -COLUMNS,
      ArrowDown: COLUMNS,
    };

    const delta = deltas[event.key];
    if (!delta) return;

    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-emoji]") ?? []),
    ];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    event.preventDefault();
    const next = Math.min(buttons.length - 1, Math.max(0, current + delta));
    buttons[next]?.focus();
  };

  const emojiButton = (glyph: string, label: string) => (
    <button
      key={glyph}
      type="button"
      data-emoji=""
      title={label}
      aria-label={label}
      onClick={() => pick(glyph)}
      className={`h-9 w-full rounded-md flex items-center justify-center text-[1.15rem] leading-none transition cursor-pointer hover:scale-115 active:scale-95 ${hoverClass(theme)}`}
    >
      {glyph}
    </button>
  );

  const section = (order: number, label: string, entries: EmojiEntry[]) => (
    <div
      key={order}
      ref={(node) => {
        sectionRefs.current[order] = node;
      }}
    >
      <div
        className={`sticky top-0 z-10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm ${stickyClass(theme)}`}
      >
        {label}
      </div>
      <div className="grid grid-cols-8 gap-0.5 px-1.5 pb-1.5">
        {entries.map((entry) => emojiButton(entry.e, entry.l))}
      </div>
    </div>
  );

  let body: ReactNode;

  if (query.trim()) {
    body = results.length ? (
      <div className="grid grid-cols-8 gap-0.5 px-1.5 pb-2">
        {results.map((entry) => emojiButton(entry.e, entry.l))}
      </div>
    ) : (
      <p className="px-3 py-10 text-center text-xs opacity-60">Không tìm thấy emoji phù hợp</p>
    );
  } else if (failed) {
    body = (
      <div className="px-3 py-10 text-center text-xs opacity-70">
        <p>Không tải được emoji.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            void loadEmojis()
              .then(setData)
              .catch(() => setFailed(true));
          }}
          className={`mt-2 rounded-lg border px-2.5 py-1 text-[11px] font-medium cursor-pointer ${fieldClass(theme)} ${hoverClass(theme)}`}
        >
          Thử lại
        </button>
      </div>
    );
  } else if (!data) {
    body = <p className="px-3 py-10 text-center text-xs opacity-60">Đang tải emoji…</p>;
  } else {
    const visible = tab === -1 ? groups : groups.filter((group) => group.order === tab);

    body = (
      <>
        {tab === -1 && recent.length > 0 && (
          <div>
            <div
              className={`sticky top-0 z-10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm ${stickyClass(theme)}`}
            >
              Gần đây
            </div>
            <div className="grid grid-cols-8 gap-0.5 px-1.5 pb-1.5">
              {recent.map((glyph) => emojiButton(glyph, glyph))}
            </div>
          </div>
        )}
        {visible.map((group) => section(group.order, group.label, byGroup.get(group.order) ?? []))}
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose?.();
        }
      }}
      style={maxHeight ? { maxHeight } : undefined}
      className={`w-[19.5rem] sm:w-[21rem] max-w-[calc(100vw-1rem)] h-[22rem] max-h-[calc(100dvh-1rem)] flex flex-col rounded-2xl border shadow-2xl backdrop-blur-xl overflow-hidden ${panelClass(theme)} ${className}`}
    >
      {quick && quick.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
          {quick.map((glyph) => (
            <button
              key={glyph}
              type="button"
              onClick={() => pick(glyph)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-base transition cursor-pointer hover:scale-115 active:scale-95 ${hoverClass(theme)}`}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1.5 p-2">
        <div
          className={`flex flex-1 items-center gap-1.5 rounded-lg border px-2 py-1.5 ${fieldClass(theme)}`}
        >
          <Search className="w-3.5 h-3.5 shrink-0 opacity-60" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // A Vietnamese IME uses Enter to accept the composed word.
              if (event.nativeEvent.isComposing) return;
              const first = results[0];
              if (!first) return;
              event.preventDefault();
              pick(first.e);
            }}
            placeholder="Tìm emoji…"
            className="w-full bg-transparent text-xs outline-none placeholder:opacity-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 cursor-pointer opacity-60 hover:opacity-100"
              title="Xoá tìm kiếm"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded-lg p-1.5 cursor-pointer ${hoverClass(theme)}`}
            title="Đóng bảng emoji"
            aria-label="Đóng bảng emoji"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 px-1.5 pb-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => goToGroup(-1)}
          className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium cursor-pointer transition ${
            tab === -1 && !query ? theme.uiAccent.brandBadge : hoverClass(theme)
          }`}
          title="Tất cả emoji"
        >
          Tất cả
        </button>
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            onClick={() => goToGroup(group.order)}
            title={group.label}
            aria-label={group.label}
            className={`shrink-0 rounded-lg w-7 h-7 flex items-center justify-center text-sm cursor-pointer transition ${
              tab === group.order && !query ? theme.uiAccent.brandBadge : hoverClass(theme)
            }`}
          >
            {GROUP_GLYPHS[group.key] ?? "•"}
          </button>
        ))}
      </div>

      <div
        ref={listRef}
        onKeyDown={onGridKeyDown}
        className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain"
      >
        {body}
      </div>
    </div>
  );
}

/**
 * The panel in a portal at a fixed point.
 *
 * The message stream scrolls and clips its children, so a reaction picker
 * anchored inside a bubble would be cut in half; the same trick the shared
 * `Menu` uses. It is clamped to the viewport and prefers to open above the
 * button it came from.
 */
export function EmojiPopover({
  anchor,
  theme,
  onPick,
  onClose,
}: {
  /** The trigger's viewport rect, taken when the button was pressed. */
  anchor: { left: number; top: number; bottom: number; width: number };
  theme: ChatTheme;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  /** Measuring a second time would read the clamped height and undo the clamp. */
  const measuredFor = useRef<unknown>(null);

  // Measured before paint, so it never flashes at the raw anchor point.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || measuredFor.current === anchor) return;
    measuredFor.current = anchor;

    const width = element.offsetWidth;
    const height = element.offsetHeight;

    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(anchor.left, window.innerWidth - width - VIEWPORT_MARGIN),
    );

    // Room above and below the trigger, margins excluded.
    const spaceAbove = anchor.top - VIEWPORT_MARGIN * 2;
    const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_MARGIN * 2;

    if (height <= spaceAbove) {
      setMaxHeight(null);
      setPosition({ left, top: anchor.top - height - VIEWPORT_MARGIN });
      return;
    }

    // Short viewport (landscape phone, on-screen keyboard): keep the roomier
    // side and let the grid shrink, otherwise the lower rows are unreachable.
    const below = spaceBelow > spaceAbove;
    const room = Math.min(
      Math.max(MIN_PANEL_HEIGHT, below ? spaceBelow : spaceAbove),
      window.innerHeight - VIEWPORT_MARGIN * 2,
    );

    setMaxHeight(room);
    setPosition({
      left,
      top: below
        ? anchor.bottom + VIEWPORT_MARGIN
        : Math.max(VIEWPORT_MARGIN, anchor.top - room - VIEWPORT_MARGIN),
    });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;

      // The "+" that opened the popover toggles it: closing here as well would
      // make the click handler reopen what this just dismissed.
      const trigger = event.target;
      if (trigger instanceof Element && trigger.closest("[data-emoji-trigger]")) return;

      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    // Scrolling the panel itself must not dismiss it; scrolling the stream must.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: position?.left ?? anchor.left,
        top: position?.top ?? anchor.top,
        // Hidden for the one frame before the clamp is known.
        visibility: position ? "visible" : "hidden",
      }}
      className="z-[70] animate-in fade-in zoom-in-95 duration-150"
    >
      <EmojiPickerPanel
        theme={theme}
        onPick={onPick}
        onClose={onClose}
        maxHeight={maxHeight}
      />
    </div>,
    document.body,
  );
}
