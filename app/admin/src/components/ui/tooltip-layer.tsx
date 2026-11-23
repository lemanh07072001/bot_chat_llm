"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Styled tooltips for every `title` in the panel.
 *
 * The panel has ~40 `title` attributes, and the browser draws them in the OS
 * style after a ~1s delay, never on keyboard focus. Rather than wrapping each
 * call site in a component, this layer is mounted once and takes over: on
 * hover or focus-visible it lifts the `title` off the element (so the native
 * tooltip cannot appear as well), shows its own, and puts the attribute back
 * when the pointer leaves. New code keeps writing plain `title=` and gets the
 * same look for free.
 *
 * While the title is lifted, an icon-only control would lose its accessible
 * name, so it gets a temporary `aria-label`; elements that already have a name
 * get the tooltip as `aria-describedby` instead.
 */

const TOOLTIP_ID = "app-tooltip";
const OPEN_DELAY = 350;
/** Moving between neighbouring buttons in a toolbar should not wait again. */
const SKIP_DELAY_WINDOW = 400;
const GAP = 8;
const VIEWPORT_MARGIN = 8;

type Side = "top" | "bottom";

type Shown = {
  text: string;
  rect: DOMRect;
};

type Position = {
  left: number;
  top: number;
  side: Side;
  arrowLeft: number;
};

type Lifted = {
  el: Element;
  text: string;
  addedLabel: boolean;
  addedDescribedBy: boolean;
  observer: MutationObserver;
};

export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lifted: Lifted | null = null;
    let openTimer: number | undefined;
    let lastHiddenAt = 0;
    let visible = false;

    const restore = () => {
      if (!lifted) return;
      const { el, text, addedLabel, addedDescribedBy, observer } = lifted;
      observer.disconnect();
      if (el.isConnected && !el.hasAttribute("title")) el.setAttribute("title", text);
      if (addedLabel) el.removeAttribute("aria-label");
      if (addedDescribedBy) {
        const ids = (el.getAttribute("aria-describedby") ?? "")
          .split(/\s+/)
          .filter((id) => id && id !== TOOLTIP_ID);
        if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
        else el.removeAttribute("aria-describedby");
      }
      lifted = null;
    };

    const hide = () => {
      window.clearTimeout(openTimer);
      openTimer = undefined;
      restore();
      if (visible) lastHiddenAt = Date.now();
      visible = false;
      setShown(null);
      setPosition(null);
    };

    const lift = (el: Element) => {
      const text = el.getAttribute("title") ?? "";
      el.removeAttribute("title");

      const hasName =
        el.hasAttribute("aria-label") ||
        el.hasAttribute("aria-labelledby") ||
        (el.textContent ?? "").trim() !== "";
      let addedLabel = false;
      let addedDescribedBy = false;
      if (!hasName) {
        el.setAttribute("aria-label", text);
        addedLabel = true;
      } else if (el.getAttribute("aria-label") !== text) {
        const ids = el.getAttribute("aria-describedby");
        el.setAttribute("aria-describedby", ids ? `${ids} ${TOOLTIP_ID}` : TOOLTIP_ID);
        addedDescribedBy = true;
      }

      // React re-applies `title` when its value changes (e.g. "Copy" →
      // "Copied"); take the new text instead of letting the native one show.
      const observer = new MutationObserver(() => {
        if (!lifted || !el.hasAttribute("title")) return;
        lifted.text = el.getAttribute("title") ?? "";
        el.removeAttribute("title");
        if (!lifted.text) hide();
        else if (visible) setShown({ text: lifted.text, rect: el.getBoundingClientRect() });
      });
      observer.observe(el, { attributes: true, attributeFilter: ["title"] });

      lifted = { el, text, addedLabel, addedDescribedBy, observer };
    };

    const findAnchor = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) return null;
      if (lifted && lifted.el.contains(target)) return lifted.el;
      const el = target.closest("[title]");
      if (!el || el === document.documentElement || el.tagName === "IFRAME") return null;
      return el.getAttribute("title")?.trim() ? el : null;
    };

    const show = (el: Element) => {
      openTimer = undefined;
      if (!lifted || lifted.el !== el || !el.isConnected) return;
      visible = true;
      setShown({ text: lifted.text, rect: el.getBoundingClientRect() });
    };

    const schedule = (el: Element, immediate: boolean) => {
      if (lifted?.el === el) return;
      hide();
      // Lift the title straight away so the native tooltip cannot race ours.
      lift(el);
      if (immediate || Date.now() - lastHiddenAt < SKIP_DELAY_WINDOW) show(el);
      else openTimer = window.setTimeout(() => show(el), OPEN_DELAY);
    };

    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = findAnchor(e.target);
      if (el) schedule(el, false);
      else if (lifted) hide();
    };

    const onPointerOut = (e: PointerEvent) => {
      if (!lifted) return;
      const to = e.relatedTarget;
      if (to instanceof Node && lifted.el.contains(to)) return;
      hide();
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof Element) || !target.matches(":focus-visible")) return;
      const el = findAnchor(target);
      if (el) schedule(el, true);
    };

    const onFocusOut = (e: FocusEvent) => {
      if (lifted && e.target instanceof Node && lifted.el.contains(e.target)) hide();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && lifted) hide();
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!shown || !tip) return;
    const { rect } = shown;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const fitsAbove = rect.top - GAP - h >= VIEWPORT_MARGIN;
    const fitsBelow = rect.bottom + GAP + h <= vh - VIEWPORT_MARGIN;
    const side: Side = fitsAbove || !fitsBelow ? "top" : "bottom";
    const top = side === "top" ? rect.top - GAP - h : rect.bottom + GAP;

    const center = rect.left + rect.width / 2;
    const maxLeft = Math.max(VIEWPORT_MARGIN, vw - VIEWPORT_MARGIN - w);
    const left = Math.min(Math.max(center - w / 2, VIEWPORT_MARGIN), maxLeft);
    const arrowLeft = Math.min(Math.max(center - left, 8), w - 8);

    setPosition({ left, top: Math.max(top, VIEWPORT_MARGIN), side, arrowLeft });
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      ref={tipRef}
      id={TOOLTIP_ID}
      role="tooltip"
      data-side={position?.side ?? "top"}
      className="app-tooltip"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {shown.text}
      <span
        aria-hidden
        className="app-tooltip-arrow"
        style={{ left: position?.arrowLeft ?? 0 }}
      />
    </div>
  );
}
