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
  .contact input {
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
  .contact input:focus-visible { outline: 2px solid var(--cc-theme); outline-offset: -1px; }
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
    /* The picker shares the full-screen card with the stream; keep a slice of
       the conversation visible above it. */
    .emoji-picker { max-height: 45vh; }
    .emoji-grid { grid-template-columns: repeat(8, 1fr); }
  }

  @media (prefers-reduced-motion: reduce) {
    .launcher { transition: none; }
  }
`;
