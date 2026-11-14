"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

const VIEWPORT_MARGIN = 8;

/**
 * A floating menu anchored at a point — what a right-click or a "⋯" button
 * opens.
 *
 * In a portal with fixed coordinates, because the panels it opens over are
 * `overflow-hidden` for their rounded corners and would clip it, and clamped to
 * the viewport so a click near the bottom edge does not push it off screen.
 *
 * Behaviour a native menu would have given for free is implemented here: focus
 * lands on the first item, ↑/↓ cycle, Home/End jump, Escape closes, and so does
 * a click outside or anything that moves the anchor.
 */
export function Menu({
  x,
  y,
  label,
  width = 224,
  onClose,
  children,
}: {
  x: number;
  y: number;
  /** Names the menu for assistive tech, usually the row it belongs to. */
  label: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Measured before paint, so the menu never flashes at the raw click point.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN));
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN),
    );

    setPosition({ left, top });
  }, [x, y, width]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    // Capture, so scrolling an inner panel closes it too.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const onArrowKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];

    if (items.length === 0) {
      return;
    }

    const index = items.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }

    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    }

    if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onArrowKeys}
      style={{
        width,
        left: position?.left ?? x,
        top: position?.top ?? y,
        // Hidden for the one frame before the clamp is known.
        visibility: position ? "visible" : "hidden",
      }}
      className="fixed z-[60] rounded-xl border border-black/[0.08] bg-white p-1 shadow-[0_12px_40px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-100"
    >
      {children}
    </div>,
    document.body,
  );
}

/** A title block at the top of a menu. Not focusable — it is not an item. */
export function MenuHeader({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mb-1 border-b border-black/[0.06]">
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0">
        <span className="block text-xs font-medium text-[#1D1D1F] truncate">{title}</span>
        {hint && <span className="block text-[10px] text-[#86868B] truncate">{hint}</span>}
      </span>
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon?: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition outline-none disabled:opacity-50 ${
        danger
          ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50"
          : "text-[#1D1D1F] hover:bg-[#F5F5F7] focus-visible:bg-[#F5F5F7]"
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        {hint && <span className="block text-[10px] text-[#86868B] leading-snug">{hint}</span>}
      </span>
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-black/[0.06]" />;
}

/** Shown in place of items when the viewer may not act on the row. */
export function MenuNote({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1.5 text-[11px] text-[#86868B] leading-relaxed">{children}</p>;
}
