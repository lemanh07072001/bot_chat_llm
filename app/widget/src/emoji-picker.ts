/**
 * The widget's emoji picker.
 *
 * A vanilla port of the admin panel's `EmojiPickerPanel`
 * (`app/admin/src/components/inbox/EmojiPicker.tsx`) with React, Tailwind and
 * the admin theme removed. Layout, search and keyboard behaviour follow that
 * component; the panel is a flex child of the chat card instead of a floating
 * popover, so none of the positioning code is needed here.
 *
 * Everything is built imperatively: `element` is handed to the caller, who
 * inserts it once (insert it before calling `open()`, otherwise the search box
 * has nothing to focus) — in the widget it goes between `.body` and
 * `.composer`. `open()`/`close()` only toggle a class, so reopening is free and
 * the query, the scroll position and the mounted groups survive.
 *
 * One attribute is shared with the caller: the composer button that toggles the
 * panel must carry `data-emoji-trigger`, so an outside press on it does not
 * dismiss the picker the click is about to reopen.
 *
 * The dataset (~183 KB) and the fill font (~1 MB) are fetched on the first
 * `open()`, never at construction: a visitor who never picks an emoji should
 * not pay for them.
 */

import {
  loadEmojiData,
  loadEmojiFont,
  type EmojiData,
  type EmojiEntry,
  type EmojiGroup,
} from './emoji-assets.js';

export interface EmojiPickerOptions {
  /** Already resolved by resolveAssetBase(); always ends with "/". */
  assetBase: string;
  /** A short row above the search box. Defaults to the widget's 8. */
  quick?: readonly string[];
  /** Called with the chosen glyph; the picker stays open. */
  onPick: (emoji: string) => void;
  /**
   * Called when Escape or the close button asks to dismiss — `outside` when the
   * press landed somewhere else on the host page, which the caller must not
   * answer by grabbing focus back from whatever the visitor just clicked.
   */
  onClose: (reason: EmojiCloseReason) => void;
  /** Called after the first successful open, so callers can lazily do work. */
  onShown?: () => void;
}

export type EmojiCloseReason = 'escape' | 'button' | 'outside';

/** Chrome strings, kept together so the widget can be localised in one place. */
const LABELS = {
  all: 'Tất cả',
  allTitle: 'Tất cả emoji',
  close: 'Đóng bảng emoji',
  search: 'Tìm emoji…',
  loading: 'Đang tải emoji…',
  failed: 'Không tải được emoji.',
  retry: 'Thử lại',
  noResults: 'Không tìm thấy emoji phù hợp',
  recent: 'Gần đây',
};

/** Static markup only — nothing here is data. */
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>';

/** The widget's own quick row; the same eight glyphs the admin inbox offers. */
const DEFAULT_QUICK: readonly string[] = ['👍', '🙏', '😊', '❤️', '👋', '✨', '🎉', '⏳'];

/** A glyph per group, used as the tab icon. */
const GROUP_GLYPHS: Record<string, string> = {
  'smileys-emotion': '😀',
  'people-body': '👋',
  'animals-nature': '🐻',
  'food-drink': '🍔',
  'travel-places': '🏝️',
  activities: '⚽',
  objects: '💡',
  symbols: '❤️',
  flags: '🏳️',
};

/** The grid is eight wide, so ↑/↓ can step by whole rows. */
const COLUMNS = 8;

/** `height: 36px` cell plus `gap: 2px`: the row pitch a placeholder has to match. */
const CELL_HEIGHT = 36;
const CELL_GAP = 2;
/** The grid's own `padding-bottom`; omitted, every group drifts 6px shorter. */
const GRID_BOTTOM_PADDING = 6;

const RECENT_LIMIT = 16;
const MAX_RESULTS = 240;
/** A group mounts within a frame or two; beyond this the request is stale. */
const REVEAL_FRAMES = 10;

const ARROW_DELTAS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -COLUMNS,
  ArrowDown: COLUMNS,
};

/** One emoji plus the pre-normalised haystack search runs against. */
interface IndexRow {
  entry: EmojiEntry;
  haystack: string;
}

/**
 * Searching should work without Vietnamese diacritics ("cuoi" finds "cười").
 * Applied once per emoji when the index is built, and once per keystroke to
 * the needle.
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/**
 * The exact height a group will have once its cells exist.
 *
 * A placeholder that is even a pixel short makes the thumb jump as groups come
 * alive, which is worse than the wait it replaces.
 */
function placeholderHeight(count: number): number {
  const rows = Math.ceil(count / COLUMNS);
  return rows * CELL_HEIGHT + Math.max(0, rows - 1) * CELL_GAP + GRID_BOTTOM_PADDING;
}

export class EmojiPicker {
  /** The panel root; the caller inserts it into the DOM. */
  readonly element: HTMLElement;

  private readonly options: EmojiPickerOptions;
  private readonly quick: readonly string[];
  private readonly searchInput: HTMLInputElement;
  private readonly tabs: HTMLDivElement;
  private readonly gridWrap: HTMLDivElement;

  /** Older embedded browsers have no IntersectionObserver; they get a full grid. */
  private readonly canObserve = typeof IntersectionObserver !== 'undefined';

  private data: EmojiData | null = null;
  private index: IndexRow[] = [];
  private byGroup = new Map<number, EmojiEntry[]>();
  private query = '';
  /** -1 shows every group with its heading; a group order shows just that one. */
  private tab = -1;
  /**
   * The visitor's last picks, newest first.
   *
   * Deliberately memory-only. The widget runs on the customer's origin, and
   * writing a "recent emoji" key into their localStorage or sessionStorage
   * would mean storing data in a namespace this script does not own — and
   * leaving it behind after the widget is removed.
   */
  private recent: string[] = [];
  /** Groups whose cells have been built; the rest are correctly-sized placeholders. */
  private mounted = new Set<number>();
  private loading = false;
  private failed = false;
  private openState = false;
  private shown = false;
  private destroyed = false;
  private observer: IntersectionObserver | null = null;
  private recentSection: HTMLDivElement | null = null;
  /**
   * Identifies the newest arrow-key request.
   *
   * Revealing a group means waiting for it to be built, which can take a few
   * frames. If the user moves on in the meantime — another arrow, a click,
   * Tab — the late callback must not drag focus back.
   */
  private navToken = 0;

  constructor(options: EmojiPickerOptions) {
    this.options = options;
    this.quick = options.quick ?? DEFAULT_QUICK;

    this.element = document.createElement('div');
    this.element.className = 'emoji-picker';

    if (this.quick.length > 0) {
      const quickRow = document.createElement('div');
      quickRow.className = 'emoji-quick';

      for (const glyph of this.quick) {
        quickRow.append(this.emojiButton(glyph, glyph));
      }

      this.element.append(quickRow);
    }

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.autocomplete = 'off';
    this.searchInput.placeholder = LABELS.search;
    this.searchInput.setAttribute('aria-label', LABELS.search);

    const searchRow = document.createElement('div');
    searchRow.className = 'emoji-search';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'emoji-close';
    closeButton.title = LABELS.close;
    closeButton.setAttribute('aria-label', LABELS.close);
    closeButton.innerHTML = CLOSE_ICON;
    closeButton.addEventListener('click', () => this.dismiss('button'));

    searchRow.append(this.searchInput, closeButton);

    this.tabs = document.createElement('div');
    this.tabs.className = 'emoji-tabs';

    this.gridWrap = document.createElement('div');
    this.gridWrap.className = 'emoji-grid-wrap';

    this.element.append(searchRow, this.tabs, this.gridWrap);

    this.element.addEventListener('click', this.onRootClick);
    this.element.addEventListener('keydown', this.onRootKeyDown);
    this.gridWrap.addEventListener('keydown', this.onGridKeyDown);
    this.searchInput.addEventListener('input', this.onInput);
    this.searchInput.addEventListener('keydown', this.onSearchKeyDown);
    // Capturing the outside click here, on the document, is what lets a shadow
    // root panel notice a press on the host page around it.
    document.addEventListener('pointerdown', this.onDocumentPointerDown);

    if (this.canObserve) {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const order = Number((entry.target as HTMLElement).dataset.group);

            if (Number.isFinite(order)) {
              this.mountGroup(order);
            }
          }
        },
        // Slightly before the group is on screen, so scrolling never reveals
        // an empty block.
        { root: this.gridWrap, rootMargin: '320px 0px' },
      );
    }

    this.renderTabs();
    this.renderBody();
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Idempotent. The first call is what starts the dataset and font download. */
  open(): void {
    if (this.destroyed || this.openState) {
      return;
    }

    this.openState = true;
    this.element.classList.add('open');

    this.beginLoad();
    // Where a picker is used from; focusing it makes typing and Escape work
    // without a click first.
    this.searchInput.focus();

    if (!this.shown) {
      this.shown = true;
      this.options.onShown?.();
    }
  }

  /** Idempotent. Deliberately keeps the query so reopening resumes the search. */
  close(): void {
    if (this.destroyed || !this.openState) {
      return;
    }

    this.openState = false;
    this.element.classList.remove('open');
  }

  toggle(): void {
    if (this.openState) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Disconnects the observer, drops the document listener and ignores in-flight work. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.openState = false;
    this.observer?.disconnect();
    this.observer = null;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
  }

  // ---------------------------------------------------------------- loading

  private beginLoad(): void {
    if (this.data || this.loading) {
      return;
    }

    this.loading = true;
    this.failed = false;
    this.renderBody();

    // Dataset and font are independent downloads; a picker that shows every
    // glyph correctly matters more than one that shows them a moment sooner.
    // A failed font is cosmetic — the platform face still draws the grid — so
    // it is swallowed rather than allowed to break the picker.
    void Promise.all([
      loadEmojiData(this.options.assetBase),
      loadEmojiFont(this.options.assetBase).catch(() => undefined),
    ])
      .then(([data]) => {
        // The picker may have been destroyed while the 183 KB was in flight;
        // building DOM then would leak listeners and fire callbacks on a dead
        // component.
        if (this.destroyed) return;

        this.loading = false;
        this.data = data;
        this.buildIndexes();

        // Seed the first group so the panel never paints an empty grid while
        // the intersection observer warms up.
        const first = data.groups[0];

        if (first && this.mounted.size === 0) {
          this.mounted.add(first.order);
        }

        this.renderTabs();
        this.renderBody();
      })
      .catch(() => {
        if (this.destroyed) return;

        this.loading = false;
        this.failed = true;
        this.renderBody();
      });
  }

  /** The asset module clears its own cache on failure, so this really refetches. */
  private retry(): void {
    this.failed = false;
    this.beginLoad();
  }

  private buildIndexes(): void {
    const emojis = this.data?.emojis ?? [];

    // Built once per dataset, not once per keystroke: normalising 1,900 labels
    // on every character typed was the stutter in the admin panel.
    this.index = emojis.map((entry) => ({
      entry,
      haystack: normalize([entry.l, ...(entry.t ?? [])].join(' ')),
    }));

    this.byGroup = new Map<number, EmojiEntry[]>();

    for (const entry of emojis) {
      const bucket = this.byGroup.get(entry.g);

      if (bucket) {
        bucket.push(entry);
      } else {
        this.byGroup.set(entry.g, [entry]);
      }
    }
  }

  /** Every word has to match, so "mèo buồn" narrows instead of widening. */
  private search(): EmojiEntry[] {
    const needle = normalize(this.query.trim());

    if (!needle) {
      return [];
    }

    const words = needle.split(/\s+/).filter(Boolean);
    const results: EmojiEntry[] = [];

    for (const row of this.index) {
      if (!words.every((word) => row.haystack.includes(word))) continue;

      results.push(row.entry);

      if (results.length >= MAX_RESULTS) break;
    }

    return results;
  }

  // ---------------------------------------------------------------- actions

  private pick(glyph: string): void {
    this.recent = [glyph, ...this.recent.filter((item) => item !== glyph)].slice(0, RECENT_LIMIT);
    this.updateRecent();
    // The panel stays open: a visitor usually picks two or three in a row.
    this.options.onPick(glyph);
  }

  private dismiss(reason: EmojiCloseReason): void {
    if (this.destroyed) {
      return;
    }

    const wasOpen = this.openState;

    this.close();

    // A press outside already moved focus where the visitor wanted it; only a
    // keyboard/button dismissal should hand it back to the composer.
    if (wasOpen) {
      this.options.onClose(reason);
    }
  }

  private goToGroup(order: number): void {
    const previous = this.tab;

    this.tab = order;

    if (this.query) {
      this.query = '';
      this.searchInput.value = '';
    }

    // Visiting a group tab mounts only that group. Returning to "Tất cả" from a
    // group starts a fresh window again, otherwise every group visited so far
    // stays mounted and the next open pays the full render cost.
    //
    // Only when the tab actually changes: clicking "Tất cả" while already there
    // would otherwise swap the live groups for placeholders nothing re-mounts,
    // because their geometry is unchanged and the observer has no reason to
    // fire again.
    if (order === -1 && previous !== -1) {
      const first = this.data?.groups[0];
      this.mounted = new Set(first ? [first.order] : []);
    }

    this.renderBody();
    this.syncTabs();
    this.scrollTo(order);
  }

  /**
   * Scrolls the grid to a group's heading.
   *
   * Measured with rects rather than `offsetTop`: the offset parent is whatever
   * positioned ancestor the host page happens to use, and a shadow root can sit
   * anywhere in it.
   */
  private scrollTo(order: number): void {
    const wrap = this.gridWrap;

    if (order === -1) {
      wrap.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const section = wrap.querySelector<HTMLElement>(`[data-group="${order}"]`);

    if (!section) {
      wrap.scrollTo({ top: 0 });
      return;
    }

    const top = section.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
    wrap.scrollTo({ top, behavior: 'smooth' });
  }

  // ------------------------------------------------------------------ render

  private renderTabs(): void {
    this.tabs.replaceChildren();

    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'emoji-tab';
    all.dataset.tab = '-1';
    all.textContent = LABELS.all;
    all.title = LABELS.allTitle;
    this.tabs.append(all);

    for (const group of this.data?.groups ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'emoji-tab emoji-tab-icon';
      button.dataset.tab = String(group.order);
      button.title = group.label;
      button.setAttribute('aria-label', group.label);
      // A glyph with no entry in the map still needs a visible tab.
      button.textContent = GROUP_GLYPHS[group.key] ?? '•';
      this.tabs.append(button);
    }

    this.syncTabs();
  }

  /** The selected tab is highlighted only while the search box is empty. */
  private syncTabs(): void {
    const highlighted = !this.query.trim();

    for (const button of Array.from(this.tabs.querySelectorAll<HTMLElement>('[data-tab]'))) {
      button.classList.toggle(
        'active',
        highlighted && Number(button.dataset.tab) === this.tab,
      );
    }
  }

  private renderBody(): void {
    if (this.destroyed) {
      return;
    }

    this.recentSection = null;
    this.gridWrap.replaceChildren();

    if (this.query.trim()) {
      const results = this.search();

      if (results.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'emoji-empty';
        empty.textContent = LABELS.noResults;
        this.gridWrap.append(empty);
      } else {
        const grid = document.createElement('div');
        grid.className = 'emoji-grid';
        this.fillEntries(grid, results);
        this.gridWrap.append(grid);
      }

      this.observeSections();
      return;
    }

    if (this.failed) {
      const box = document.createElement('div');
      box.className = 'emoji-empty';

      const text = document.createElement('p');
      text.textContent = LABELS.failed;

      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'emoji-retry';
      retry.textContent = LABELS.retry;
      retry.addEventListener('click', () => this.retry());

      box.append(text, retry);
      this.gridWrap.append(box);
      this.observeSections();
      return;
    }

    if (!this.data) {
      // A silent skeleton instead of a "loading" line: the panel is already the
      // right shape, so it reads as already-open rather than as a reload. The
      // text is kept for screen readers only.
      this.gridWrap.append(this.buildSkeleton());
      // Nothing to observe yet, but any sections from a previous render are gone.
      this.observeSections();
      return;
    }

    // "Gần đây" only belongs in the all-groups view; a single group tab has no
    // room for a prefix that is not that group.
    if (this.tab === -1 && this.recent.length > 0) {
      this.gridWrap.append(this.buildRecentSection());
    }

    const groups =
      this.tab === -1
        ? this.data.groups
        : this.data.groups.filter((group) => group.order === this.tab);

    for (const group of groups) {
      this.gridWrap.append(this.buildSection(group, this.byGroup.get(group.order) ?? []));
    }

    this.observeSections();
  }

  /**
   * Placeholders with the exact geometry of the real grid, so the panel never
   * changes height when the dataset arrives (that jump is what made reopening
   * feel like a reload).
   */
  private buildSkeleton(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'emoji-skeleton';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', LABELS.loading);

    const grid = document.createElement('div');
    grid.className = 'emoji-grid';

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < COLUMNS * 6; index++) {
      const cell = document.createElement('span');
      cell.className = 'emoji-skeleton-cell';
      cell.setAttribute('aria-hidden', 'true');
      fragment.append(cell);
    }

    grid.append(fragment);
    wrap.append(grid);

    return wrap;
  }

  private buildRecentSection(): HTMLDivElement {
    const section = document.createElement('div');

    const heading = document.createElement('div');
    heading.className = 'emoji-heading';
    heading.textContent = LABELS.recent;

    const grid = document.createElement('div');
    grid.className = 'emoji-grid';

    const fragment = document.createDocumentFragment();

    for (const glyph of this.recent) {
      const button = this.emojiButton(glyph, glyph);
      button.className = 'emoji-cell';
      fragment.append(button);
    }

    grid.append(fragment);
    section.append(heading, grid);
    this.recentSection = section;

    return section;
  }

  private buildSection(group: EmojiGroup, entries: readonly EmojiEntry[]): HTMLDivElement {
    const section = document.createElement('div');
    section.dataset.group = String(group.order);

    const heading = document.createElement('div');
    heading.className = 'emoji-heading';
    heading.textContent = group.label;

    const grid = document.createElement('div');
    grid.className = 'emoji-grid';

    // The selected tab always renders: there is nothing to lazy-load inside it.
    const shown = !this.canObserve || this.tab === group.order || this.mounted.has(group.order);

    if (shown) {
      grid.dataset.mounted = '1';
      this.fillEntries(grid, entries);
    } else {
      grid.style.height = `${placeholderHeight(entries.length)}px`;
    }

    section.append(heading, grid);

    return section;
  }

  private fillEntries(grid: HTMLElement, entries: readonly EmojiEntry[]): void {
    const fragment = document.createDocumentFragment();

    for (const entry of entries) {
      const button = this.emojiButton(entry.e, entry.l);
      button.className = 'emoji-cell';
      fragment.append(button);
    }

    grid.replaceChildren(fragment);
  }

  private emojiButton(glyph: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.emoji = '';
    // The label is data, so it goes through attributes and a text node; never
    // through innerHTML.
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = glyph;

    return button;
  }

  /**
   * Replaces the recent strip in place, leaving the group sections — and the
   * cell the keyboard is on — untouched.
   */
  private updateRecent(): void {
    const existing = this.recentSection;
    const active = this.activeElement();
    const hadFocus = existing !== null && active !== null && existing.contains(active);
    const at = existing ? Array.from(this.gridWrap.children).indexOf(existing) : 0;

    existing?.remove();
    this.recentSection = null;

    if (!this.data || this.query.trim() || this.tab !== -1 || this.recent.length === 0) {
      return;
    }

    const section = this.buildRecentSection();
    const before = this.gridWrap.children[at] ?? null;
    this.gridWrap.insertBefore(section, before);

    // The old cell was destroyed with the strip; the newest pick is the first
    // cell of the new one, which is where the caret was.
    if (hadFocus) {
      section.querySelector<HTMLButtonElement>('[data-emoji]')?.focus();
    }
  }

  // ------------------------------------------------------------- lazy mount

  private observeSections(): void {
    if (!this.observer) {
      return;
    }

    this.observer.disconnect();

    for (const node of Array.from(this.gridWrap.querySelectorAll<HTMLElement>('[data-group]'))) {
      const grid = node.querySelector<HTMLElement>('.emoji-grid');

      // Already built (its tab is selected, or the observer fired once).
      if (grid?.dataset.mounted === '1') continue;

      this.observer.observe(node);
    }
  }

  /** Builds a group's cells into its existing placeholder. */
  private mountGroup(order: number): void {
    const section = this.gridWrap.querySelector<HTMLElement>(`[data-group="${order}"]`);
    const grid = section?.querySelector<HTMLElement>('.emoji-grid');

    if (!section || !grid) {
      return;
    }

    if (grid.dataset.mounted === '1') {
      this.mounted.add(order);
      return;
    }

    grid.dataset.mounted = '1';
    grid.style.height = '';
    this.fillEntries(grid, this.byGroup.get(order) ?? []);
    this.mounted.add(order);
  }

  // --------------------------------------------------------------- keyboard

  /**
   * The focused node inside this picker.
   *
   * Inside a shadow root `document.activeElement` is the host element, not the
   * cell the user is on, so the root has to answer for itself.
   */
  private activeElement(): HTMLElement | null {
    const root = this.element.getRootNode();

    if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
      return root.activeElement instanceof HTMLElement ? root.activeElement : null;
    }

    return document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  /** Moves focus to a cell of `order`; false while that group is still a placeholder. */
  private focusCell(order: number, at: number | 'first' | 'last'): boolean {
    const cells = this.gridWrap.querySelectorAll<HTMLButtonElement>(
      `[data-group="${order}"] [data-emoji]`,
    );

    if (cells.length === 0) {
      return false;
    }

    const target = at === 'first' ? cells[0] : at === 'last' ? cells[cells.length - 1] : cells[at];

    if (!target) {
      return false;
    }

    target.focus();

    return true;
  }

  private readonly onGridKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;

    const delta = ARROW_DELTAS[event.key];

    if (!delta) return;

    const active = this.activeElement();

    if (!active) return;

    const holder = active.closest<HTMLElement>('[data-group]');

    // Search results and the "Gần đây" strip carry no group identity. Both are
    // short and always fully rendered, so plain neighbour stepping is right.
    if (!holder) {
      const flat = Array.from(this.gridWrap.querySelectorAll<HTMLButtonElement>('[data-emoji]'));
      const at = flat.indexOf(active as HTMLButtonElement);

      if (at === -1) return;

      event.preventDefault();
      flat[at + delta]?.focus();
      return;
    }

    // Step inside the group this cell belongs to, measured on that group's own
    // cells. Counting over every mounted button instead would skip whole
    // groups: once the user has scrolled far enough that group 3 is alive but
    // group 1 is still a placeholder, "+1 from the last cell of group 0" lands
    // in 3.
    const order = Number(holder.dataset.group);
    const groups = this.data?.groups ?? [];
    const index = groups.findIndex((group) => group.order === order);

    if (index === -1) return;

    const cells = Array.from(holder.querySelectorAll<HTMLButtonElement>('[data-emoji]'));
    const at = cells.indexOf(active as HTMLButtonElement);

    if (at === -1) return;

    event.preventDefault();
    const token = (this.navToken += 1);

    const next = at + delta;

    if (next >= 0 && next < cells.length) {
      cells[next].focus();
      return;
    }

    // Crossed a group edge. A single group on its own tab has nothing beyond it.
    if (this.tab !== -1) return;

    const neighbour = groups[index + (delta > 0 ? 1 : -1)];

    if (!neighbour) return;

    const edge = delta > 0 ? 'first' : 'last';
    /** Where the caret was when the request was made; a late callback must not steal focus. */
    const origin = active;

    const reveal = (attempt: number): void => {
      if (this.destroyed) return;
      // Another arrow key, a Tab or a click superseded this request.
      if (this.navToken !== token) return;
      if (this.activeElement() !== origin) return;
      if (this.focusCell(neighbour.order, edge)) return;

      if (attempt < REVEAL_FRAMES) {
        window.requestAnimationFrame(() => reveal(attempt + 1));
      }
    };

    // Walking past the mounted range has to bring the next group in first,
    // otherwise the caret hits an invisible wall and the rest of the grid is
    // mouse-only. Focus by group identity rather than by index: a newly mounted
    // group is inserted where it belongs, which shifts every index after it.
    if (this.focusCell(neighbour.order, edge)) return;

    this.mountGroup(neighbour.order);

    if (this.focusCell(neighbour.order, edge)) return;

    window.requestAnimationFrame(() => reveal(0));
  };

  private readonly onRootKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }

    // The chat card behind the picker closes on Escape too; dismissing the
    // picker must not take the whole conversation with it.
    event.stopPropagation();
    this.dismiss('escape');
  };

  private readonly onSearchKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || event.key !== 'Enter') {
      return;
    }

    // A Vietnamese IME uses Enter to accept the composed word.
    if (event.isComposing) {
      return;
    }

    const first = this.search()[0];

    if (!first) {
      return;
    }

    event.preventDefault();
    this.pick(first.e);
  };

  private readonly onInput = (): void => {
    if (this.destroyed) return;

    this.query = this.searchInput.value;
    this.renderBody();
    this.syncTabs();
  };

  private readonly onRootClick = (event: MouseEvent): void => {
    if (this.destroyed) return;

    const target = event.target;

    if (!(target instanceof Element)) return;

    const tab = target.closest<HTMLElement>('[data-tab]');

    if (tab && this.tabs.contains(tab)) {
      this.goToGroup(Number(tab.dataset.tab));
      return;
    }

    const cell = target.closest<HTMLElement>('[data-emoji]');

    if (!cell) return;

    // The glyph lives in the button's text node; `data-emoji` is a marker, so
    // the markup stays identical for every cell.
    const glyph = cell.textContent?.trim() ?? '';

    if (glyph) {
      this.pick(glyph);
    }
  };

  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    if (this.destroyed || !this.openState) return;

    // Retargeting hides every node inside a shadow root from `document`, so the
    // path taken by the event — not `event.target` — is what tells us the press
    // landed in our panel.
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

    const inside =
      path.length > 0
        ? path.includes(this.element)
        : event.target instanceof Node && this.element.contains(event.target);

    if (inside) return;

    // The button that opened the picker toggles it: closing here as well would
    // make its click handler reopen what this just dismissed.
    const onTrigger = path.some(
      (node) => node instanceof Element && node.hasAttribute('data-emoji-trigger'),
    );

    if (onTrigger) return;

    this.dismiss('outside');
  };
}
