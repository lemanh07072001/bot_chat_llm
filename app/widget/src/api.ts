import type {
  AgentProfile,
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

export async function createSession(apiUrl: string, publicKey: string): Promise<WidgetSession> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/widget/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, visitorKey: readVisitorKey(publicKey) }),
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    if (problem?.code === 'WIDGET_MAINTENANCE') throw new Error('WIDGET_MAINTENANCE');
    throw new Error(`Chat session failed (${response.status})`);
  }

  const session = (await response.json()) as WidgetSession;

  writeVisitorKey(publicKey, session.visitorKey);

  return session;
}

export async function fetchAvailability(apiUrl: string, token: string): Promise<WidgetAvailability> {
  const response = await fetch(trimTrailingSlash(apiUrl) + '/widget/availability', { headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) throw new Error('Availability unavailable');
  return response.json() as Promise<WidgetAvailability>;
}
