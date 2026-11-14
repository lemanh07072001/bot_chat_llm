"use client";

import { useId, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type TabItem<K extends string> = {
  key: K;
  label: string;
  icon?: LucideIcon;
  /** Small count or word shown after the label. */
  badge?: string | number;
};

/**
 * A row of tabs over one panel.
 *
 * Follows the tabs pattern rather than a row of links: arrow keys move between
 * tabs and `aria-controls` ties the strip to the panel, so a screen reader
 * announces the switch instead of leaving the reader to guess what changed.
 * Activation follows focus, which is what suits panels this cheap to render.
 */
export function Tabs<K extends string>({
  items,
  active,
  onChange,
  panelId,
  className = "",
}: {
  items: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  /** The id of the element this strip controls. */
  panelId: string;
  className?: string;
}) {
  const baseId = useId();
  const stripRef = useRef<HTMLDivElement | null>(null);

  const move = (direction: 1 | -1) => {
    const index = items.findIndex((item) => item.key === active);
    const next = items[(index + direction + items.length) % items.length];

    if (!next) {
      return;
    }

    onChange(next.key);
    // Focus follows the selection so the next arrow press continues from here.
    stripRef.current
      ?.querySelector<HTMLButtonElement>(`[data-key="${next.key}"]`)
      ?.focus();
  };

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-orientation="horizontal"
      className={`flex items-center gap-1 overflow-x-auto ${className}`}
    >
      {items.map((item) => {
        const selected = item.key === active;
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            data-key={item.key}
            id={`${baseId}-${item.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            // Only the selected tab is in the tab order; arrows move inside.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              }
            }}
            className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition outline-none focus-visible:bg-[#F5F5F7] ${
              selected
                ? "border-[#EA580C] text-[#EA580C]"
                : "border-transparent text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== "" && (
              <span
                className={`text-[10px] font-semibold px-1.5 rounded-md ${
                  selected ? "bg-amber-50 text-[#EA580C]" : "bg-[#F5F5F7] text-[#86868B]"
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The panel the strip controls. Kept separate so the strip can sit in a header. */
export function TabPanel({
  id,
  className = "",
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} role="tabpanel" tabIndex={-1} className={className}>
      {children}
    </div>
  );
}
