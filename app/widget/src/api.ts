import type {
  AgentProfile,
  AttachmentView,
  ChatMessage,
  VisitorContact,
  WidgetSession,
  WidgetAvailability,
} from './types.js';

/**
 * The visitor key is the only thing we persist. It is an opaque server-minted
 * id, and losing it simply starts a new conversation, so a browser that blocks
 * storage still works.
 */
const storageKey = (publicKey: string) => `chat-center:visitor:${publicKey}`;

export function readVisitorKey(publicKey: string): string | undefined {
  try {
    return window.localStorage.getItem(storageKey(publicKey)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeVisitorKey(publicKey: string, visitorKey: string): void {
  try {
    window.localStorage.setItem(storageKey(publicKey), visitorKey);
  } catch {
    // Private mode or blocked storage: the visitor just won't be recognised next visit.
  }
}

/**
 * The unread badge is per site as well: a page can embed two widgets, and a
 * count that survived a reload on one must not light up the other.
 */
const unreadStorageKey = (publicKey: string) => `chat-center:unread:${publicKey}`;

const MAX_UNREAD = 99;

export function unreadKey(publicKey: string): string {
  return unreadStorageKey(publicKey);
}

export function readUnread(publicKey: string): number {
  try {
    const value = Number.parseInt(
      window.localStorage.getItem(unreadStorageKey(publicKey)) ?? '',
      10,
    );

    return Number.isFinite(value) && value > 0 ? Math.min(MAX_UNREAD, value) : 0;
  } catch {
    return 0;
  }
}

export function writeUnread(publicKey: string, count: number): void {
  const value = Math.min(MAX_UNREAD, Math.max(0, Math.trunc(count) || 0));

  try {
    if (value === 0) {
      window.localStorage.removeItem(unreadStorageKey(publicKey));
    } else {
      window.localStorage.setItem(unreadStorageKey(publicKey), String(value));
    }
  } catch {
    // Blocked storage: the badge simply starts at zero on the next page view.
  }
}

const trimTrailingSlash = (apiUrl: string) => apiUrl.replace(/\/$/, '');

/**
 * Walks backwards through the thread. The conversation is taken from the
 * token, so no identifier is sent.
 */
export async function fetchOlderMessages(
  apiUrl: string,
  visitorToken: string,
  before: string,
): Promise<WidgetMessagePage> {
  return loadMessages(apiUrl, visitorToken, before);
}

/**
 * The newest page. Used after a reconnect, where events that arrived while the
 * socket was down were never delivered.
 */
export async function fetchRecentMessages(
  apiUrl: string,
  visitorToken: string,
): Promise<WidgetMessagePage> {
  return loadMessages(apiUrl, visitorToken, null);
}

export interface WidgetMessagePage {
  messages: ChatMessage[];
  agents: AgentProfile[];
  hasMore: boolean;
  nextCursor: string | null;
}

async function loadMessages(
  apiUrl: string,
  visitorToken: string,
  before: string | null,
): Promise<WidgetMessagePage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  const response = await fetch(`${trimTrailingSlash(apiUrl)}/widget/messages${query}`, {
    headers: { Authorization: `Bearer ${visitorToken}` },
  });

  if (!response.ok) {
    throw new Error(`Loading history failed (${response.status})`);
  }

  return (await response.json()) as WidgetMessagePage;
}

/** Stores a name and email so an out-of-hours chat can be answered later. */
export async function saveContact(
  apiUrl: string,
  visitorToken: string,
  contact: { name?: string; email?: string },
): Promise<VisitorContact> {
  const response = await fetch(`${trimTrailingSlash(apiUrl)}/widget/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${visitorToken}`,
    },
    body: JSON.stringify(contact),
  });

  if (!response.ok) {
    throw new Error(`Saving contact failed (${response.status})`);
  }

  return (await response.json()) as VisitorContact;
}

/**
 * Leaves a request for when nobody can answer. The server also stores the
 * name/email on the visitor. A 429 becomes `RATE_LIMITED` so the form can say so.
 */
export async function submitTicket(
  apiUrl: string,
  visitorToken: string,
  ticket: { name?: string; email: string; message: string; attachmentIds?: string[] },
): Promise<{ id: string; number: number }> {
  const response = await fetch(`${trimTrailingSlash(apiUrl)}/widget/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${visitorToken}`,
    },
    body: JSON.stringify(ticket),
  });

  if (response.status === 429) {
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    throw new Error(`Submitting ticket failed (${response.status})`);
  }

  return (await response.json()) as { id: string; number: number };
}

/**
 * Uploads one image for the visitor's conversation. XHR rather than fetch so
 * the composer can show progress. 429 → `RATE_LIMITED`, 413 → `TOO_LARGE`.
 */
export function uploadImage(
  apiUrl: string,
  visitorToken: string,
  file: Blob,
  meta: { name?: string; width?: number; height?: number },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<AttachmentView> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Upload aborted'));
      return;
    }

    const form = new FormData();

    form.append('file', file, meta.name || 'image');

    if (meta.width) form.append('width', String(Math.round(meta.width)));
    if (meta.height) form.append('height', String(Math.round(meta.height)));
    if (meta.name) form.append('name', meta.name.slice(0, 200));

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();

    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener('abort', onAbort);

    xhr.open('POST', `${trimTrailingSlash(apiUrl)}/widget/uploads`);
    xhr.setRequestHeader('Authorization', `Bearer ${visitorToken}`);
    xhr.responseType = 'json';

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(1, event.loaded / event.total));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status === 429) return reject(new Error('RATE_LIMITED'));
      if (xhr.status === 413) return reject(new Error('TOO_LARGE'));
      if (xhr.status < 200 || xhr.status >= 300) {
        return reject(new Error(`Upload failed (${xhr.status})`));
      }

      const payload = xhr.response as AttachmentView | null;

      if (!payload || typeof payload.id !== 'string' || typeof payload.url !== 'string') {
        return reject(new Error('Upload failed (bad response)'));
      }

      resolve(payload);
    };
    xhr.onerror = () => reject(new Error('Upload failed (network)'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(form);
  });
}

export async function createSession(apiUrl: string, publicKey: string): Promise<WidgetSession> {
  const session = await bootstrapSession(apiUrl, publicKey, false);

  writeVisitorKey(publicKey, session.visitorKey);

  return session;
}

/**
 * Re-attaches to the thread a returning visitor already had, without opening
 * the panel. The server is asked not to create anything (`resumeOnly`): an
 * unknown visitor key comes back as `{ resumed: false }` and the widget stays
 * lazy until the visitor actually opens it.
 *
 * An older server ignores the flag and answers with a normal session, which is
 * equally fine — there is nothing left to create when the key is already known.
 */
export async function resumeSession(
  apiUrl: string,
  publicKey: string,
): Promise<WidgetSession | null> {
  const visitorKey = readVisitorKey(publicKey);

  if (!visitorKey) {
    return null;
  }

  const session = await bootstrapSession(apiUrl, publicKey, true).catch(() => null);

  if (!session) {
    return null;
  }

  writeVisitorKey(publicKey, session.visitorKey);

  return session;
}

async function bootstrapSession(
  apiUrl: string,
  publicKey: string,
  resumeOnly: boolean,
): Promise<WidgetSession> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/widget/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey,
      visitorKey: readVisitorKey(publicKey),
      ...(resumeOnly ? { resumeOnly: true } : {}),
    }),
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    if (problem?.code === 'WIDGET_MAINTENANCE') throw new Error('WIDGET_MAINTENANCE');
    throw new Error(`Chat session failed (${response.status})`);
  }

  const payload = (await response.json()) as WidgetSession | { resumed: false };

  if (!('visitorToken' in payload) || !payload.visitorToken) {
    throw new Error('Chat session was not resumed');
  }

  return payload;
}

export async function fetchAvailability(apiUrl: string, token: string): Promise<WidgetAvailability> {
  const response = await fetch(trimTrailingSlash(apiUrl) + '/widget/availability', { headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) throw new Error('Availability unavailable');
  return response.json() as Promise<WidgetAvailability>;
}
