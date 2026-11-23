/**
 * Everything lives inside a shadow root, so `all: initial` on :host plus
 * explicit values below keep the host page's CSS from leaking in.
 */
export const STYLES = `
  /*
   * The emoji fill font comes first in the stack. It is registered at runtime
   * by document.fonts.add() with a unicode-range covering only emoji
   * codepoints, so the browser downloads the ~1 MB file only when it meets a
   * character the subset actually owns; font-display: swap keeps text visible
   * while it arrives.
   */
  :host {
    all: initial;
    font-family: 'ChatEmojiFill', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --cc-theme: #2563eb;
    --cc-surface: #ffffff;
    --cc-text: #1d1d1f;
    --cc-muted: #6e6e73;
    --cc-hairline: rgba(0, 0, 0, 0.08);
    --cc-visitor-bg: var(--cc-theme);
    --cc-agent-bg: #f1f1f3;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .launcher {
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: 56px;
    height: 56px;
    border: 0;
    border-radius: 50%;
    background: var(--cc-theme);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    display: grid;
    place-items: center;
    transition: transform 160ms ease, box-shadow 160ms ease;
    z-index: 2147483000;
  }
  .launcher:hover { transform: scale(1.06); }
  .launcher:active { transform: scale(0.97); }
  .launcher:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 3px; }
  .launcher svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; }

  /* One nudge when a new agent message lands while the panel is closed; the
     class is added once and removed when the animation ends. */
  .launcher.attention { animation: cc-launcher-attention 1.1s ease-in-out; }
  @keyframes cc-launcher-attention {
    0%, 100% { transform: translateY(0) scale(1); }
    30% { transform: translateY(-6px) scale(1.05); }
    55% { transform: translateY(0) scale(1); }
    75% { transform: translateY(-3px) scale(1.02); }
  }
  @media (prefers-reduced-motion: reduce) {
    .launcher.attention { animation: none; }
  }

  /*
   * An avatar slot. The picture sits on top of the initials, so a missing or
   * broken image simply reveals the letters underneath — no layout shift, and
   * nothing to toggle beyond the image's own hidden attribute.
   */
  .identity {
    position: relative;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.22);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #fff;
    user-select: none;
  }
  .identity img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .identity img[hidden] { display: none; }

  .badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    background: #ff3b30;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 20px;
    text-align: center;
    display: none;
  }
  .badge.visible { display: block; }

  .panel {
    position: fixed;
    right: 20px;
    bottom: 88px;
    width: 368px;
    height: 520px;
    max-height: calc(100vh - 120px);
    background: var(--cc-surface);
    border: 1px solid var(--cc-hairline);
    border-radius: 16px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
    display: none;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483000;
  }
  .panel.open { display: flex; }

  .header {
    padding: 14px 16px;
    background: var(--cc-theme);
    color: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
  }
  .header-text { flex: 1; min-width: 0; }
  .title { font-size: 15px; font-weight: 600; line-height: 1.3; }
  .status { font-size: 12px; opacity: 0.85; line-height: 1.4; }
  .close {
    border: 0;
    background: transparent;
    color: #fff;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: grid;
    place-items: center;
  }
  .close:hover { background: rgba(255, 255, 255, 0.18); }
  .close:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  .close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; }

  .maintenance-notice { padding: 18px; background: #fff7ed; color: #9a3412; font-size: 14px; line-height: 1.5; text-align: center; }
  .maintenance-notice[hidden] { display: none; }

  /*
   * The team's busy/away banner. Soft amber while they are busy (they are
   * there, just occupied), plain slate while they are away (nobody is). It is
   * a sibling of the stream, so it stays put while messages scroll.
   */
  .notice {
    flex: 0 0 auto;
    padding: 10px 14px;
    border-bottom: 1px solid var(--cc-hairline);
    background: #f6f6f8;
    color: var(--cc-text);
    font-size: 12.5px;
    line-height: 1.45;
  }
  /* Also spelled out for the shadow root: a bare [hidden] rule from the host
     page cannot reach in here, and the class rules above set display. */
  .notice[hidden] { display: none; }
  .notice-title { font-weight: 600; margin-bottom: 2px; }
  .notice-text { color: var(--cc-muted); overflow-wrap: anywhere; }
  .notice-busy { background: #fff8eb; border-bottom-color: rgba(180, 120, 20, 0.22); }
  .notice-busy .notice-title { color: #92400e; }
  .notice-busy .notice-text { color: #a16207; }
  .notice-away { background: #f6f6f8; }
  .notice-away .notice-title { color: #3c3c43; }

  .body {
    flex: 1 1 auto;
    padding: 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #fbfbfd;
  }

  .row { display: flex; gap: 8px; align-items: flex-end; }
  .row.from-visitor { justify-content: flex-end; }
  .row.from-agent { justify-content: flex-start; }
  .row.from-system { justify-content: center; }

  .bubble {
    max-width: 78%;
    padding: 9px 13px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--cc-text);
    background: var(--cc-agent-bg);
    /* Message bodies are arbitrary text; never let one break the layout. */
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .from-visitor .bubble {
    background: var(--cc-visitor-bg);
    color: #fff;
    border-bottom-right-radius: 5px;
  }
  .from-agent .bubble { border-bottom-left-radius: 5px; }
  .from-system .bubble {
    background: transparent;
    color: var(--cc-muted);
    font-size: 12.5px;
    text-align: center;
    max-width: 100%;
  }

  .row-main { min-width: 0; max-width: 85%; }
  .row-main .bubble { max-width: 100%; }
  .from-visitor .sender { justify-content: flex-end; }

  .sender {
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-size: 11px;
    color: var(--cc-muted);
    margin: 0 4px 2px;
  }
  .sender-name { font-weight: 600; color: var(--cc-text); }
  /* The job title is the quieter half of the line and may be long. */
  .sender-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sender-title::before { content: "·"; margin-right: 5px; }

  /* A follow-up from the same person: keep the indent, drop the repetition. */
  .row.grouped .sender { display: none; }

  /* Reactions live on their own wrapped line under the bubble, so a long badge
     row never squeezes the message text. */
  .row.reactable { flex-wrap: wrap; }
  .row-extra {
    flex: 0 0 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 3px;
    min-width: 0;
  }
  .from-visitor .row-extra { align-items: flex-end; }
  .from-agent .row-extra { align-items: flex-start; }

  .reactions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .row:hover .reactions,
  .row:focus-within .reactions,
  .row.has-reactions .reactions,
  .row.react-open .reactions { opacity: 1; }
  /* No hover on a phone, so the entry point is always faintly visible. */
  @media (hover: none) { .reactions { opacity: 0.7; } }

  .reaction-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 22px;
    padding: 0 8px;
    border: 1px solid var(--cc-hairline);
    border-radius: 999px;
    background: var(--cc-surface);
    color: var(--cc-muted);
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }
  .reaction-badge:hover { background: var(--cc-agent-bg); }
  .reaction-badge:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 1px; }
  /* The visitor's own reaction gets a tinted fill, not just a coloured edge,
     so it stands apart from an agent's badge at a glance. */
  .reaction-badge.mine {
    border-color: var(--cc-theme);
    color: var(--cc-theme);
    background: color-mix(in srgb, var(--cc-theme) 12%, var(--cc-surface));
  }
  .reaction-badge.mine:hover {
    background: color-mix(in srgb, var(--cc-theme) 20%, var(--cc-surface));
  }
  .reaction-glyph { font-size: 13px; line-height: 1; }

  .react-trigger {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px dashed var(--cc-hairline);
    border-radius: 999px;
    background: transparent;
    color: var(--cc-muted);
    cursor: pointer;
  }
  .react-trigger:hover { background: var(--cc-agent-bg); color: var(--cc-text); }
  .react-trigger:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 1px; }
  .react-trigger svg { width: 13px; height: 13px; fill: currentColor; }

  .react-bar {
    display: none;
    align-items: center;
    gap: 1px;
    padding: 3px;
    border: 1px solid var(--cc-hairline);
    border-radius: 999px;
    background: var(--cc-surface);
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.1);
  }
  .row.react-open .react-bar { display: flex; }

  .react-choice {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    font-family: inherit;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
    transition: transform 0.12s ease, background 0.12s ease;
  }
  .react-choice:hover { background: var(--cc-agent-bg); transform: scale(1.18); }
  .react-choice:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -2px; }
  @media (prefers-reduced-motion: reduce) {
    .react-choice { transition: none; }
    .react-choice:hover { transform: none; }
  }

  .load-older { display: none; padding: 8px 14px 0; text-align: center; }
  .load-older.visible { display: block; }
  .load-older button {
    border: 1px solid var(--cc-hairline);
    background: var(--cc-surface);
    color: var(--cc-muted);
    border-radius: 999px;
    padding: 4px 12px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .load-older button:hover { color: var(--cc-text); }
  .load-older button:disabled { opacity: 0.6; cursor: default; }

  .contact {
    display: none;
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    border-top: 1px solid var(--cc-hairline);
    background: #fafafa;
  }
  .contact.visible { display: flex; }
  .contact-text { font-size: 12px; color: var(--cc-muted); line-height: 1.45; }
  .contact-fields { display: flex; gap: 6px; }
  .contact input,
  .contact textarea {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--cc-hairline);
    border-radius: 8px;
    padding: 7px 9px;
    font: inherit;
    font-size: 13px;
    color: var(--cc-text);
    background: var(--cc-surface);
  }
  .contact textarea { resize: vertical; min-height: 54px; max-height: 160px; line-height: 1.4; }
  .contact input:focus-visible,
  .contact textarea:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -1px; }
  .contact-done {
    display: none;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 14px;
    border-top: 1px solid var(--cc-hairline);
    background: #f0fdf4;
  }
  .contact-done.visible { display: flex; }
  .contact-done-text { font-size: 12px; color: #166534; line-height: 1.45; }
  .contact-again {
    border: 0;
    padding: 0;
    background: none;
    color: var(--cc-theme);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }
  .contact-send {
    align-self: flex-start;
    border: 0;
    border-radius: 8px;
    background: var(--cc-theme);
    color: #fff;
    padding: 7px 12px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .contact-send:disabled { opacity: 0.6; cursor: default; }

  .typing { display: none; padding: 0 4px 4px; font-size: 12px; color: var(--cc-muted); }
  .typing.visible { display: block; }

  .composer {
    flex: 0 0 auto;
    border-top: 1px solid var(--cc-hairline);
    padding: 10px;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--cc-surface);
  }
  .input {
    flex: 1;
    border: 1px solid var(--cc-hairline);
    border-radius: 12px;
    padding: 9px 12px;
    /* Not the 'font' shorthand: it also resets the family a form control picks
       for itself, which would drop the emoji face the visitor typed. */
    font-family: inherit;
    font-size: 14px;
    line-height: 1.45;
    color: var(--cc-text);
    background: #fff;
    resize: none;
    max-height: 96px;
    min-height: 38px;
  }
  .input:focus { outline: none; border-color: var(--cc-theme); }
  .input:disabled { background: #f5f5f7; color: var(--cc-muted); }

  .send {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 50%;
    background: var(--cc-theme);
    color: #fff;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .send:disabled { opacity: 0.4; cursor: not-allowed; }
  .send:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 2px; }
  .send svg { width: 17px; height: 17px; fill: currentColor; }

  /*
   * Emoji picker. It is a flex item of the chat card that sits between the
   * stream and the composer, so it pushes the stream up instead of covering
   * the last messages the way a floating popover would.
   */
  .emoji-picker {
    flex: 0 0 auto;
    display: none;
    flex-direction: column;
    min-height: 0;
    border-top: 1px solid var(--cc-hairline);
    background: var(--cc-surface);
    max-height: min(20rem, 60%);
  }
  .emoji-picker.open { display: flex; }

  .emoji-quick {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    padding: 8px 6px 0;
  }
  .emoji-quick button {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 0;
    /* A <button> does not inherit the family; without this the fill font never
       reaches the glyph and newer emoji fall back to the platform face. */
    font-family: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .emoji-quick button:hover { background: var(--cc-agent-bg); }
  .emoji-quick button:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -2px; }

  .emoji-search {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    padding: 8px 6px;
  }
  .emoji-search input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--cc-hairline);
    border-radius: 8px;
    padding: 6px 8px;
    /* A form control defaults to the platform UI font; the widget wants its own. */
    font-family: inherit;
    font-size: 12px;
    color: var(--cc-text);
    background: var(--cc-surface);
  }
  .emoji-search input:focus { outline: none; border-color: var(--cc-theme); }

  .emoji-close {
    flex: 0 0 auto;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--cc-muted);
    padding: 6px;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .emoji-close:hover { background: var(--cc-agent-bg); }
  .emoji-close:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 1px; }
  .emoji-close svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; }

  .emoji-tabs {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    padding: 0 6px 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .emoji-tabs::-webkit-scrollbar { display: none; }
  .emoji-tab {
    flex: 0 0 auto;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--cc-text);
    padding: 4px 8px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .emoji-tab:hover { background: var(--cc-agent-bg); }
  .emoji-tab.active { background: var(--cc-theme); color: #fff; }
  .emoji-tab:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -2px; }
  .emoji-tab-icon {
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 15px;
    font-weight: 400;
    line-height: 1;
    display: grid;
    place-items: center;
  }

  .emoji-grid-wrap {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .emoji-heading {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 4px 8px;
    background: var(--cc-surface);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--cc-muted);
  }
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    padding: 0 6px 6px;
  }
  .emoji-cell {
    height: 36px;
    width: 100%;
    border: 0;
    background: transparent;
    border-radius: 6px;
    /* A <button> does not inherit the family; without this the fill font never
       reaches the glyph and newer emoji fall back to the platform face. */
    font-family: inherit;
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .emoji-cell:hover { background: var(--cc-agent-bg); }
  .emoji-cell:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -2px; }

  /* Reserves the grid's shape while the dataset is in flight, so the panel
     opens at its final height instead of growing under the visitor's cursor. */
  .emoji-skeleton-cell {
    height: 36px;
    border-radius: 6px;
    background: var(--cc-agent-bg);
    animation: cc-emoji-pulse 1.2s ease-in-out infinite;
  }
  .emoji-skeleton-cell:nth-child(2n) { animation-delay: 0.15s; }
  .emoji-skeleton-cell:nth-child(3n) { animation-delay: 0.3s; }

  @keyframes cc-emoji-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 0.85; }
  }

  @media (prefers-reduced-motion: reduce) {
    .emoji-skeleton-cell { animation: none; opacity: 0.5; }
  }

  .emoji-empty {
    padding: 24px 12px;
    text-align: center;
    font-size: 12px;
    color: var(--cc-muted);
  }
  .emoji-empty p { margin: 0 0 8px; }
  .emoji-retry {
    border: 1px solid var(--cc-hairline);
    border-radius: 8px;
    background: var(--cc-surface);
    color: var(--cc-text);
    padding: 4px 10px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .emoji-retry:hover { background: var(--cc-agent-bg); }
  .emoji-retry:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -1px; }

  /* The composer button that opens the picker; wired up in widget.ts. */
  .emoji-trigger {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--cc-muted);
    padding: 0;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .emoji-trigger:hover { background: var(--cc-agent-bg); }
  .emoji-trigger:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 2px; }
  .emoji-trigger svg { width: 18px; height: 18px; fill: currentColor; }

  /* Image attachments: composer button, pending tray, bubble grid. */
  .attach-trigger {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--cc-muted);
    padding: 0;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .attach-trigger[hidden] { display: none; }
  .attach-trigger:hover { background: var(--cc-agent-bg); }
  .attach-trigger:disabled { opacity: 0.4; cursor: not-allowed; }
  .attach-trigger:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 2px; }
  .attach-trigger svg { width: 19px; height: 19px; fill: currentColor; }

  .attach-tray {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .attach-tray[hidden] { display: none; }
  .attach-tray-chat {
    border-top: 1px solid var(--cc-hairline);
    padding: 8px 10px 0;
    background: var(--cc-surface);
  }
  .attach-tray-chat + .composer { border-top: 0; }
  .attach-item {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--cc-agent-bg);
    flex: 0 0 auto;
  }
  .attach-thumb {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: default;
  }
  .attach-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .attach-thumb:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -2px; }
  .attach-item[data-state="uploading"] .attach-thumb img { opacity: 0.55; }
  .attach-item[data-state="error"] .attach-thumb { cursor: pointer; }
  .attach-item[data-state="error"] .attach-thumb img { opacity: 0.35; }
  .attach-item[data-state="error"] { box-shadow: inset 0 0 0 2px #d93025; }
  .attach-item[data-state="error"]::after {
    content: "!";
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #b3261e;
    font-weight: 700;
    font-size: 18px;
    pointer-events: none;
  }
  .attach-spinner {
    display: none;
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 2px solid rgba(255, 255, 255, 0.7);
    border-top-color: var(--cc-theme);
    border-radius: 50%;
    animation: cc-attach-spin 0.8s linear infinite;
    pointer-events: none;
  }
  .attach-item[data-state="uploading"] .attach-spinner { display: block; }
  @keyframes cc-attach-spin { to { transform: rotate(360deg); } }
  .attach-progress {
    display: none;
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 4px;
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.6);
    overflow: hidden;
    pointer-events: none;
  }
  .attach-item[data-state="uploading"] .attach-progress { display: block; }
  .attach-progress-bar { height: 100%; width: 0; background: var(--cc-theme); transition: width 0.15s linear; }
  .attach-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 50%;
    padding: 0;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font: inherit;
    font-size: 14px;
    line-height: 20px;
    text-align: center;
    cursor: pointer;
  }
  .attach-remove:hover { background: rgba(0, 0, 0, 0.8); }
  .attach-remove:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 1px; }
  .attach-remove:disabled, .attach-thumb:disabled { opacity: 0.6; cursor: not-allowed; }

  .contact-attach-row { display: flex; }
  .contact-attach {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px dashed var(--cc-hairline);
    border-radius: 8px;
    background: transparent;
    color: var(--cc-muted);
    padding: 5px 10px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .contact-attach:hover { color: var(--cc-text); background: var(--cc-agent-bg); }
  .contact-attach:disabled { opacity: 0.6; cursor: not-allowed; }
  .contact-attach:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 1px; }
  .contact-attach svg { width: 16px; height: 16px; fill: currentColor; }

  .panel.dragging { box-shadow: 0 0 0 3px var(--cc-theme), 0 12px 40px rgba(0, 0, 0, 0.18); }

  .bubble.has-media { padding: 4px; }
  .bubble-text { padding: 5px 9px 5px; }
  .media-grid { display: grid; gap: 4px; }
  .media-grid.single { max-width: 240px; }
  .media-grid.multi { grid-template-columns: repeat(2, minmax(0, 1fr)); width: 240px; max-width: 100%; }
  .media-item {
    display: block;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.06);
  }
  .media-item:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: 2px; }
  .media-item img { display: block; width: 100%; }
  .media-grid.single .media-item img { height: auto; max-height: 320px; object-fit: cover; }
  .media-grid.multi .media-item { aspect-ratio: 1 / 1; }
  .media-grid.multi .media-item img { height: 100%; object-fit: cover; }

  @media (prefers-reduced-motion: reduce) {
    .attach-spinner { animation-duration: 2s; }
    .attach-progress-bar { transition: none; }
  }

  .error {
    margin: 0 14px 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #fff2f2;
    color: #b3261e;
    font-size: 12.5px;
    display: none;
  }
  .error.visible { display: block; }

  @media (max-width: 480px) {
    .panel {
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
      border: 0;
    }
    .launcher { right: 16px; bottom: 16px; }
    .notice { padding: 9px 12px; font-size: 12px; }
    /* Narrow screens: stack name/email; 16px avoids iOS zoom on focus. */
    .contact-fields { flex-direction: column; }
    .contact input, .contact textarea { font-size: 16px; }
    /* The picker shares the full-screen card with the stream; keep a slice of
       the conversation visible above it. */
    .emoji-picker { max-height: 45vh; }
    .attach-item { width: 52px; height: 52px; }
    .attach-remove { width: 24px; height: 24px; line-height: 24px; }
    .emoji-grid { grid-template-columns: repeat(8, 1fr); }
  }

  /*
   * The tooltip drawn by tooltip.ts for every title attribute. Near-black like
   * the card's own text so it reads against any site theme colour, and above
   * the panel's z-index so it is never tucked under the card.
   */
  .cc-tooltip {
    position: fixed;
    z-index: 2147483001;
    max-width: min(240px, calc(100vw - 16px));
    padding: 5px 9px;
    border-radius: 7px;
    background: #1d1d1f;
    color: #fff;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.35;
    white-space: pre-line;
    overflow-wrap: anywhere;
    pointer-events: none;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }
  .cc-tooltip[hidden] { display: none; }
  .cc-tooltip-in { animation: cc-tooltip-in 120ms ease-out; }
  .cc-tooltip-in[data-side="bottom"] { animation-name: cc-tooltip-in-below; }
  .cc-tooltip-arrow {
    position: absolute;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    background: inherit;
    border-radius: 1px;
    transform: rotate(45deg);
  }
  .cc-tooltip[data-side="top"] .cc-tooltip-arrow { bottom: -4px; }
  .cc-tooltip[data-side="bottom"] .cc-tooltip-arrow { top: -4px; }
  @keyframes cc-tooltip-in {
    from { opacity: 0; transform: translateY(3px); }
  }
  @keyframes cc-tooltip-in-below {
    from { opacity: 0; transform: translateY(-3px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .launcher { transition: none; }
    .cc-tooltip-in { animation: none; }
  }
`;
