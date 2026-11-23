export interface ChatWidgetOptions {
  /** Site public key from the admin panel, e.g. pk_0123… */
  publicKey: string;
  /** Base URL of the api, e.g. http://localhost:3000/api */
  apiUrl: string;
  /** Element to mount into; defaults to document.body */
  target?: HTMLElement;
  /** Overrides the title configured on the site. */
  title?: string;
  /**
   * Directory holding `emoji-data.json` and `chat-emoji-fill.woff2`, trailing
   * slash and all. Derived from the script src when omitted.
   */
  assetBaseUrl?: string;
  /** Chime when an agent writes while the panel is closed. Default true. */
  notifySound?: boolean;
  /** Blink the page title while the tab is hidden. Default true. */
  notifyTitle?: boolean;
}

export interface ChatWidgetInstance {
  open(): void;
  close(): void;
  destroy(): void;
}

export interface WidgetSettings {
  title: string;
  imageUrl?: string;
  themeColor: string;
  greeting: string;
  /** What the notice panel shows while the team is busy. */
  busyMessage?: string;
  /** What the notice panel shows while the team is away. */
  awayMessage?: string;
}

/**
 * The team's own availability, mirrored from the api's agent-status module: a
 * site is `offline` when no agent is connected at all.
 */
export type TeamStatus = 'online' | 'busy' | 'away' | 'offline';

export type MessageSenderKind = 'visitor' | 'agent' | 'system';

export type ReactionKind = 'visitor' | 'agent';

/**
 * One person's reaction. `id` is a visitor or user id, so a client tells its own
 * reaction apart by comparing it with its own identity.
 */
export interface MessageReaction {
  emoji: string;
  kind: ReactionKind;
  id: string;
}

/**
 * The public half of a staff account: what the api is willing to tell a
 * visitor about the person answering them.
 */
export interface AgentProfile {
  id: string;
  name: string;
  /** "Tư vấn viên", "Trưởng nhóm hỗ trợ"… null when nobody set one. */
  jobTitle: string | null;
  avatarUrl: string | null;
}

/** An uploaded image as the api describes it (public URL). */
export interface AttachmentView {
  id: string;
  url: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  size: number;
  width: number | null;
  height: number | null;
  name: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderKind: MessageSenderKind;
  senderId: string | null;
  senderName?: string;
  /** Present on agent messages pushed over the socket. */
  sender?: AgentProfile | null;
  /** May be '' when the message only carries images. */
  body: string;
  attachments?: AttachmentView[];
  reactions?: MessageReaction[];
  createdAt: string;
}

/** What the visitor should expect, decided by the api. */
export interface WidgetAvailability {
  maintenance?: boolean;
  agentsOnline: boolean;
  withinOfficeHours: boolean;
  offlineMessage: string;
  /**
   * Optional because an older api omits it; when missing, `agentsOnline` is
   * the whole truth (true → online, false → offline).
   */
  teamStatus?: TeamStatus;
  /** Site-configured wording for the busy notice (falls back to a default). */
  busyMessage?: string;
  /** Site-configured wording for the away notice (falls back to a default). */
  awayMessage?: string;
}

export interface VisitorContact {
  name: string | null;
  email: string | null;
}

export interface WidgetSession {
  visitorToken: string;
  realtimeUrl?: string;
  visitorKey: string;
  /** This visitor's own id, so a reaction can be recognised as its own. */
  visitorId: string;
  conversationId: string;
  settings: WidgetSettings;
  availability: WidgetAvailability;
  contact: VisitorContact;
  messages: ChatMessage[];
  /** Everyone who appears in `messages`, plus whoever holds the thread. */
  agents: AgentProfile[];
  assignedAgent: AgentProfile | null;
  /** True when the thread has older messages than the ones sent here. */
  hasMoreMessages: boolean;
  nextMessageCursor: string | null;
}
