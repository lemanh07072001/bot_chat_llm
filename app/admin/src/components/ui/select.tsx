"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { Field, type FieldSize } from "./field";

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary line under the label, e.g. an email address. */
  hint?: string;
  /** A colour dot in front of the label. */
  swatch?: string;
  disabled?: boolean;
};

type Placement = { left: number; top: number; width: number; maxHeight: number; above: boolean };

const LIST_MAX_HEIGHT = 288;
const VIEWPORT_MARGIN = 8;

/**
 * A select whose option list is ours to style.
 *
 * A native `<select>` hands its popup to the operating system, so the rows
 * cannot carry a second line, a colour dot or a tick — hence a listbox built
 * from scratch. What that costs is the behaviour the platform used to give for
 * free, so it is all implemented here: `combobox`/`listbox` roles, arrow keys,
 * Home/End, Enter, Escape, click-outside, and a hidden input so the value still
 * reaches a plain form (these panels submit through server actions).
 *
 * Focus deliberately stays on the trigger while the list is open, with
 * `aria-activedescendant` pointing at the highlighted row. That is simpler and
 * steadier than moving focus into the list and having to put it back.
 *
 * The list renders in a portal with fixed coordinates, because the panels it
 * sits in are `overflow-hidden` for their rounded corners and would otherwise
 * clip it.
 */
export function Select({
  options,
  value,
  onChange,
  name,
  id,
  label,
  required = false,
  placeholder = "Chọn…",
  /** Replaces the placeholder when there is nothing to choose from. */
  emptyLabel = "Không có lựa chọn nào",
  hint,
  error,
  disabled = false,
  size = "md",
  className = "",
  "aria-label": ariaLabel,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  size?: FieldSize;
  className?: string;
  "aria-label"?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listId = `${generatedId}-list`;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const isEmpty = options.length === 0;
  const isDisabled = disabled || isEmpty;
  const selected = options.find((option) => option.value === value) ?? null;
  const selectableIndexes = options.flatMap((option, index) => (option.disabled ? [] : [index]));

  const measure = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const above = rect.top - VIEWPORT_MARGIN;
    // Open upwards only when that genuinely leaves more room.
    const openAbove = below < Math.min(LIST_MAX_HEIGHT, above) && above > below;

    setPlacement({
      left: rect.left,
      top: openAbove ? rect.top : rect.bottom + 4,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(LIST_MAX_HEIGHT, openAbove ? above : below)),
      above: openAbove,
    });
  }, []);

  // Before paint, so the list never shows at a stale position for a frame.
  useLayoutEffect(() => {
    if (open) {
      measure();
    }
  }, [open, measure]);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Capture, so scrolling an ancestor panel moves the list too.
    const reposition = () => measure();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, measure]);

  // Keeps the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }

    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = (startAt: "selected" | "first" | "last") => {
    if (isDisabled) {
      return;
    }

    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    const fallback =
      startAt === "last"
        ? (selectableIndexes.at(-1) ?? -1)
        : (selectableIndexes[0] ?? -1);

    setActiveIndex(startAt === "selected" && selectedIndex >= 0 ? selectedIndex : fallback);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];

    if (!option || option.disabled) {
      return;
    }

    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (selectableIndexes.length === 0) {
      return;
    }

    const current = selectableIndexes.indexOf(activeIndex);
    const next =
      current === -1
        ? (direction === 1 ? selectableIndexes[0] : selectableIndexes.at(-1)!)
        : (selectableIndexes[
            (current + direction + selectableIndexes.length) % selectableIndexes.length
          ] ?? activeIndex);

    setActiveIndex(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (open) {
          moveActive(1);
        } else {
          openList("selected");
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) {
          moveActive(-1);
        } else {
          openList("last");
        }
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(selectableIndexes[0] ?? -1);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(selectableIndexes.at(-1) ?? -1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) {
          commit(activeIndex);
        } else {
          openList("selected");
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        // Let focus leave, but do not leave a popup hanging behind it.
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const triggerSizing = size === "sm" ? "px-3 py-1.5 text-xs gap-2" : "px-3.5 py-2 text-sm gap-2.5";

  return (
    <Field
      label={label}
      htmlFor={triggerId}
      required={required}
      hint={hint}
      error={error}
      size={size}
    >
      {/* The value still travels in a plain form submission. */}
      {name && <input type="hidden" name={name} value={value} />}

      <div className={className}>
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={error ? true : undefined}
          disabled={isDisabled}
          onClick={() => (open ? setOpen(false) : openList("selected"))}
          onKeyDown={onKeyDown}
          className={`w-full flex items-center justify-between rounded-xl border bg-white text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C]/20 disabled:bg-[#F5F5F7] disabled:cursor-not-allowed ${triggerSizing} ${
            error
              ? "border-red-300"
              : open
                ? "border-[#EA580C]"
                : "border-neutral-200 hover:border-neutral-300"
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            {selected?.swatch && (
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                style={{ backgroundColor: selected.swatch }}
              />
            )}
            <span className={`truncate ${selected ? "text-[#1D1D1F]" : "text-[#86868B]"}`}>
              {selected ? selected.label : isEmpty ? emptyLabel : placeholder}
            </span>
            {selected?.hint && (
              <span className="truncate text-[11px] text-[#86868B] hidden sm:inline">
                {selected.hint}
              </span>
            )}
          </span>

          <ChevronDown
            aria-hidden="true"
            className={`shrink-0 text-[#86868B] transition-transform ${
              size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"
            } ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open &&
        placement &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label ?? ariaLabel}
            style={{
              left: placement.left,
              width: placement.width,
              maxHeight: placement.maxHeight,
              ...(placement.above
                ? { bottom: window.innerHeight - placement.top + 4 }
                : { top: placement.top }),
            }}
            className="fixed z-[60] overflow-y-auto overscroll-contain rounded-xl border border-black/[0.08] bg-white p-1 shadow-[0_12px_40px_rgba(0,0,0,0.14)] animate-in fade-in zoom-in-95 duration-100"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;

              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  data-index={index}
                  onPointerEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                    option.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : `cursor-pointer ${isActive ? "bg-[#F5F5F7]" : ""}`
                  }`}
                >
                  {option.swatch && (
                    <span
                      aria-hidden="true"
                      className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                      style={{ backgroundColor: option.swatch }}
                    />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-[#1D1D1F] truncate">
                      {option.label}
                    </span>
                    {option.hint && (
                      <span className="block text-[11px] text-[#86868B] truncate">
                        {option.hint}
                      </span>
                    )}
                  </span>

                  {isSelected && <Check aria-hidden="true" className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </Field>
  );
}
