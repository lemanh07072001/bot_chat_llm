/**
 * Styled tooltips for every `title` inside the widget's shadow root.
 *
 * The browser draws `title` in the OS style after a ~1s delay and never on
 * keyboard focus, which looks foreign inside the card. This takes over the
 * whole root once: on hover or focus-visible it lifts the `title` off the
 * element (so the native tooltip cannot appear as well), shows its own, and
 * puts the attribute back when the pointer leaves. Code that sets `el.title`
 * keeps working unchanged.
 *
 * While the title is lifted, an icon-only control would lose its accessible
 * name, so it gets a temporary `aria-label`; elements that already have a name
 * get the tooltip as `aria-describedby` instead.
 */

const TOOLTIP_ID = 'cc-tooltip';
const OPEN_DELAY = 350;
/** Moving between neighbouring buttons (e.g. the emoji grid) should not wait again. */
const SKIP_DELAY_WINDOW = 400;
const GAP = 8;
const VIEWPORT_MARGIN = 8;

type Lifted = {
  el: Element;
  text: string;
  addedLabel: boolean;
  addedDescribedBy: boolean;
  observer: MutationObserver;
};

/** Returns a cleanup that removes the listeners and the tooltip element. */
export function attachTooltips(root: ShadowRoot): () => void {
  const tip = document.createElement('div');
  tip.className = 'cc-tooltip';
  tip.id = TOOLTIP_ID;
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const label = document.createElement('span');
  const arrow = document.createElement('span');
  arrow.className = 'cc-tooltip-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  tip.append(label, arrow);
  root.append(tip);

  let lifted: Lifted | null = null;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHiddenAt = 0;
  let visible = false;

  const place = (anchor: Element) => {
    const rect = anchor.getBoundingClientRect();
    tip.hidden = false;
    tip.style.visibility = 'hidden';
    tip.style.left = '0px';
    tip.style.top = '0px';
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const fitsAbove = rect.top - GAP - h >= VIEWPORT_MARGIN;
    const fitsBelow = rect.bottom + GAP + h <= vh - VIEWPORT_MARGIN;
    const side = fitsAbove || !fitsBelow ? 'top' : 'bottom';
    const top = side === 'top' ? rect.top - GAP - h : rect.bottom + GAP;

    const center = rect.left + rect.width / 2;
    const maxLeft = Math.max(VIEWPORT_MARGIN, vw - VIEWPORT_MARGIN - w);
    const left = Math.min(Math.max(center - w / 2, VIEWPORT_MARGIN), maxLeft);

    tip.dataset.side = side;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(top, VIEWPORT_MARGIN)}px`;
    arrow.style.left = `${Math.min(Math.max(center - left, 10), w - 10)}px`;
    tip.style.visibility = '';
  };

  const show = (el: Element) => {
    openTimer = undefined;
    if (!lifted || lifted.el !== el || !el.isConnected) return;
    visible = true;
    label.textContent = lifted.text;
    // Restart the entrance animation for each new anchor.
    tip.classList.remove('cc-tooltip-in');
    void tip.offsetWidth;
    tip.classList.add('cc-tooltip-in');
    place(el);
  };

  const restore = () => {
    if (!lifted) return;
    const { el, text, addedLabel, addedDescribedBy, observer } = lifted;
    observer.disconnect();
    if (el.isConnected && !el.hasAttribute('title')) el.setAttribute('title', text);
    if (addedLabel) el.removeAttribute('aria-label');
    if (addedDescribedBy) {
      const ids = (el.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((id) => id && id !== TOOLTIP_ID);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    }
    lifted = null;
  };

  const hide = () => {
    clearTimeout(openTimer);
    openTimer = undefined;
    restore();
    if (visible) lastHiddenAt = Date.now();
    visible = false;
    tip.hidden = true;
  };

  const lift = (el: Element) => {
    const text = el.getAttribute('title') ?? '';
    el.removeAttribute('title');

    const hasName =
      el.hasAttribute('aria-label') ||
      el.hasAttribute('aria-labelledby') ||
      (el.textContent ?? '').trim() !== '';
    let addedLabel = false;
    let addedDescribedBy = false;
    if (!hasName) {
      el.setAttribute('aria-label', text);
      addedLabel = true;
    } else if (el.getAttribute('aria-label') !== text) {
      const ids = el.getAttribute('aria-describedby');
      el.setAttribute('aria-describedby', ids ? `${ids} ${TOOLTIP_ID}` : TOOLTIP_ID);
      addedDescribedBy = true;
    }

    // A title rewritten while lifted (a reaction toggled under the pointer)
    // must update ours rather than bring the native tooltip back.
    const observer = new MutationObserver(() => {
      if (!lifted || !el.hasAttribute('title')) return;
      lifted.text = el.getAttribute('title') ?? '';
      el.removeAttribute('title');
      if (!lifted.text) hide();
      else if (visible) {
        label.textContent = lifted.text;
        place(el);
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['title'] });

    lifted = { el, text, addedLabel, addedDescribedBy, observer };
  };

  const findAnchor = (target: EventTarget | null): Element | null => {
    if (!(target instanceof Element)) return null;
    if (lifted && lifted.el.contains(target)) return lifted.el;
    const el = target.closest('[title]');
    return el && el.getAttribute('title')?.trim() ? el : null;
  };

  const schedule = (el: Element, immediate: boolean) => {
    if (lifted?.el === el) return;
    hide();
    // Lift the title straight away so the native tooltip cannot race ours.
    lift(el);
    if (immediate || Date.now() - lastHiddenAt < SKIP_DELAY_WINDOW) show(el);
    else openTimer = setTimeout(() => show(el), OPEN_DELAY);
  };

  const onPointerOver = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    const el = findAnchor(e.target);
    if (el) schedule(el, false);
    else if (lifted) hide();
  };

  const onPointerOut = (e: Event) => {
    if (!lifted) return;
    const to = (e as PointerEvent).relatedTarget;
    if (to instanceof Node && lifted.el.contains(to)) return;
    hide();
  };

  const onFocusIn = (e: Event) => {
    const target = e.target;
    if (!(target instanceof Element) || !target.matches(':focus-visible')) return;
    const el = findAnchor(target);
    if (el) schedule(el, true);
  };

  const onFocusOut = (e: Event) => {
    if (lifted && e.target instanceof Node && lifted.el.contains(e.target)) hide();
  };

  const onKeyDown = (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape' && lifted) hide();
  };

  root.addEventListener('pointerover', onPointerOver, true);
  root.addEventListener('pointerout', onPointerOut, true);
  root.addEventListener('pointerdown', hide, true);
  root.addEventListener('focusin', onFocusIn, true);
  root.addEventListener('focusout', onFocusOut, true);
  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('scroll', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);

  return () => {
    hide();
    root.removeEventListener('pointerover', onPointerOver, true);
    root.removeEventListener('pointerout', onPointerOut, true);
    root.removeEventListener('pointerdown', hide, true);
    root.removeEventListener('focusin', onFocusIn, true);
    root.removeEventListener('focusout', onFocusOut, true);
    root.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener('scroll', hide, true);
    window.removeEventListener('scroll', hide, true);
    window.removeEventListener('resize', hide);
    window.removeEventListener('blur', hide);
    tip.remove();
  };
}
