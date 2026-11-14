import { ChatWidget } from './widget.js';
import type { ChatWidgetInstance, ChatWidgetOptions } from './types.js';

export type { ChatWidgetInstance, ChatWidgetOptions, ChatMessage, WidgetSettings } from './types.js';

export function init(options: ChatWidgetOptions): ChatWidgetInstance {
  return new ChatWidget(options);
}

/**
 * Falls back to the origin the script itself was served from, so a widget
 * hosted next to the api needs nothing but the key. In split deployments the
 * snippet carries an explicit data-api-url.
 */
function deriveApiUrl(script: HTMLScriptElement | null): string {
  const explicit = script?.dataset.apiUrl;

  if (explicit) {
    return explicit;
  }

  if (script?.src) {
    return new URL('/api', script.src).toString();
  }

  return '/api';
}

/**
 * Auto-boot for the one-line embed. `document.currentScript` is only valid
 * while the script body runs, so it is read synchronously here — before any
 * listener or promise — and captured for later.
 */
function autoBoot(): void {
  const script = document.currentScript as HTMLScriptElement | null;
  const publicKey = script?.dataset.chatCenterKey;

  if (!publicKey) {
    // Loaded as a module or without a key: the host page drives init() itself.
    return;
  }

  const options: ChatWidgetOptions = {
    publicKey,
    apiUrl: deriveApiUrl(script),
    title: script?.dataset.title,
  };

  const start = () => {
    init(options);
  };

  // With `async` in <head> the body may not exist yet.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

autoBoot();
