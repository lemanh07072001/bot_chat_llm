export interface ChatWidgetOptions {
  /** Site public key from the admin panel, e.g. pk_0123… */
  publicKey: string;
  /** Base URL of the api, e.g. http://localhost:3000/api */
  apiUrl: string;
  /** Element to mount into; defaults to document.body */
  target?: HTMLElement;
  /** Overrides the title configured on the site. */
  title?: string;
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
}

export type MessageSenderKind = 'visitor' | 'agent' | 'system';

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

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderKind: MessageSenderKind;
  senderId: string | null;
  senderName?: string;
  /** Present on agent messages pushed over the socket. */
  sender?: AgentProfile | null;
  body: string;
  createdAt: string;
}

/** What the visitor should expect, decided by the api. */
export interface WidgetAvailability {
  maintenance?: boolean;
  agentsOnline: boolean;
  withinOfficeHours: boolean;
  offlineMessage: string;
}

export interface VisitorContact {
  name: string | null;
  email: string | null;
}

export interface WidgetSession {
  visitorToken: string;
  realtimeUrl?: string;
  visitorKey: string;
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
