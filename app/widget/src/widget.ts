import { io, type Socket } from 'socket.io-client';
import { createSession, fetchOlderMessages, fetchRecentMessages, saveContact, fetchAvailability } from './api.js';
import type { WidgetMessagePage } from './api.js';
import { registerEmojiFont, resolveAssetBase } from './emoji-assets.js';
import { EmojiPicker } from './emoji-picker.js';
import { STYLES } from './styles.js';
import type {
  AgentProfile,
  ChatMessage,
  ChatWidgetInstance,
  ChatWidgetOptions,
  MessageReaction,
  WidgetAvailability,
  WidgetSession,
} from './types.js';

/** Chrome strings, kept together so the widget can be localised in one place. */
const LABELS = {
  launcherOpen: 'Mở hộp chat',
  close: 'Đóng hộp chat',
  send: 'Gửi tin nhắn',
  emojiPicker: 'Chèn biểu tượng cảm xúc',
  placeholder: 'Nhập tin nhắn…',
  connecting: 'Đang kết nối…',
  online: 'Đang trực tuyến',
  away: 'Sẽ phản hồi sớm',
  outsideHours: 'Ngoài giờ làm việc',
  offline: 'Đang kết nối lại…',
  loadOlder: 'Xem tin nhắn cũ hơn',
  loadingOlder: 'Đang tải…',
  contactIntro: 'Để lại email để chúng tôi trả lời bạn khi quay lại nhé.',
  contactName: 'Tên của bạn (không bắt buộc)',
  contactEmail: 'Email',
  contactSubmit: 'Gửi thông tin',
  contactThanks: 'Đã nhận thông tin của bạn, chúng tôi sẽ liên hệ sớm.',
  contactInvalid: 'Email chưa hợp lệ, bạn kiểm tra lại giúp nhé.',
  agentTyping: 'Đang trả lời…',
  defaultTitle: 'Chat',
  failed: 'Không kết nối được dịch vụ chat. Vui lòng thử lại.',
  react: 'Thả cảm xúc',
  reactMine: 'Bạn đã thả cảm xúc này',
};

/**
 * The bar that opens on a message. Deliberately short: these are the six the
 * widget's own font covers completely, and it keeps the tap targets reachable
 * on a phone.
 */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * How many pages a reconnect reads while closing a gap. Each page is 30
 * messages, so this only matters after a very long drop; the walk stops at the
 * first page that overlaps what is on screen, or at the start of the thread.
 */
const RESYNC_MAX_PAGES = 20;

/** The only two url shapes an avatar or a logo may take. */
const SAFE_IMAGE_URL = /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/;

/** Fallback for an avatar with no picture: up to two letters from the name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '';
  }

  const letters =
    parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];

  return letters.toUpperCase();
}

const TYPING_IDLE_MS = 2000;
const TYPING_THROTTLE_MS = 1200;

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1a8.1 8.1 0 0 1-.9-3.7A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4l17.4-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.2L4.2 11 14 12l-9.8 1 -2.2 6.2a1 1 0 0 0 1.4 1.2z"/></svg>',
  smile: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path fill-rule="evenodd" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.2 8.1a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm5.6 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM8.1 13.4a4 4 0 0 0 7.8 0z"/></svg>',
};

export class ChatWidget implements ChatWidgetInstance {
  private readonly host = document.createElement('div');
  private readonly root: ShadowRoot;

  private readonly panel: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private readonly badge: HTMLSpanElement;
  private readonly titleEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly typingEl: HTMLDivElement;
  private readonly errorEl: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly emojiTrigger: HTMLButtonElement;
  private readonly emojiHost: HTMLDivElement;
  private readonly loadOlderWrap: HTMLDivElement;
  private readonly loadOlderButton: HTMLButtonElement;
  private readonly contactForm: HTMLFormElement;
  private readonly contactText: HTMLDivElement;
  private readonly contactName: HTMLInputElement;
  private readonly contactEmail: HTMLInputElement;
  private readonly contactSend: HTMLButtonElement;

  /**
   * Everyone the widget has been told about, by id. Messages only carry a
   * sender id, so this is what turns one into a face and a job title — and it
   * keeps a profile that arrived over the socket available to the rows that
   * are prepended later when the visitor scrolls up.
   */
  private readonly agentsById = new Map<string, AgentProfile>();
  /** Whoever the header presents: the assignee, or failing that the last replier. */
  private activeAgent: AgentProfile | null = null;
  /** Kept so the status line can be recomposed with the job title. */
  private statusText = '';

  private session: WidgetSession | null = null;
  private socket: Socket | null = null;
  private bootstrapping: Promise<void> | null = null;
  private isOpen = false;
  private unread = 0;
  private connected = false;
  private maintenance = false;
  private availability: WidgetAvailability | null = null;
  private hasOlder = false;
  private historyCursor: string | null = null;
  private loadingOlder = false;
  private contactCaptured = false;
  private offlineNoticeShown = false;
  private lastTypingSentAt = 0;
  private typingIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private agentTypingTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private availabilityTimer: ReturnType<typeof setInterval> | null = null;
  /** Built on the first trigger press, so a visitor who never picks one pays nothing. */
  private picker: EmojiPicker | null = null;
  /**
   * Where the caret was when the composer last had focus.
   *
   * Pressing the trigger moves focus off the textarea, and a textarea that is
   * not focused still reports its selection — but only until something else
   * sets it, so it is captured on every interaction that can move it.
   */
  private draftSelection: { start: number; end: number } | null = null;
  /** The row whose reaction bar is open, so an outside press can close it. */
  private reactingRow: HTMLElement | null = null;
  /** Latest server state per message, so a click never acts on a stale render. */
  private readonly reactionsByMessage = new Map<string, MessageReaction[]>();
  /** False until the first handshake, so a reconnect can be told apart. */
  private hasHandshaked = false;
  /** True while the newest page is being re-read after a reconnect. */
  private resyncing = false;
  /** A second reconnect landed mid-resync, so one more pass is owed. */
  private resyncPending = false;
  /** Reactions that arrived mid-resync, replayed after the snapshot is applied. */
  private readonly bufferedReactions = new Map<string, MessageReaction[]>();

  private readonly options: ChatWidgetOptions;

  constructor(options: ChatWidgetOptions) {
    this.options = options;
    this.root = this.host.attachShadow({ mode: 'open' });
    // Static scaffolding only — every piece of message text is set via
    // textContent later, never interpolated into markup.
    this.root.innerHTML = `
      <style>${STYLES}</style>
      <div class="panel" role="dialog" aria-modal="false" aria-label="Chat">
        <div class="header">
          <span class="identity">
            <img class="identity-image" alt="" referrerpolicy="no-referrer" hidden />
            <span class="identity-initials" aria-hidden="true"></span>
          </span>
          <div class="header-text">
            <div class="title"></div>
            <div class="status"></div>
          </div>
          <button class="close" type="button">${ICONS.close}</button>
        </div>
        <div class="load-older">
          <button class="load-older-button" type="button"></button>
        </div>
        <div class="body" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="typing"></div>
        <div class="error" role="alert"></div>
        <form class="contact">
          <div class="contact-text"></div>
          <div class="contact-fields">
            <input class="contact-name" type="text" autocomplete="name" />
            <input class="contact-email" type="email" autocomplete="email" required />
          </div>
          <button class="contact-send" type="submit"></button>
        </form>
        <!-- display:contents keeps the picker a flex item of the card, which
             is the layout .emoji-picker is written for. -->
        <div class="emoji-host" style="display: contents"></div>
        <div class="composer">
          <button class="emoji-trigger" type="button" aria-expanded="false" data-emoji-trigger>${ICONS.smile}</button>
          <textarea class="input" rows="1"></textarea>
          <button class="send" type="button" disabled>${ICONS.send}</button>
        </div>
      </div>
      <button class="launcher" type="button">
        ${ICONS.chat}
        <span class="badge"></span>
      </button>
    `;

    this.panel = this.must('.panel');
    this.launcher = this.must('.launcher');
    this.badge = this.must('.badge');
    this.titleEl = this.must('.title');
    this.statusEl = this.must('.status');
    this.body = this.must('.body');
    this.typingEl = this.must('.typing');
    this.errorEl = this.must('.error');
    this.input = this.must('.input');
    this.sendButton = this.must('.send');
    this.emojiTrigger = this.must('.emoji-trigger');
    this.emojiHost = this.must('.emoji-host');
    this.loadOlderWrap = this.must('.load-older');
    this.loadOlderButton = this.must('.load-older-button');
    this.contactForm = this.must('.contact');
    this.contactText = this.must('.contact-text');
    this.contactName = this.must('.contact-name');
    this.contactEmail = this.must('.contact-email');
    this.contactSend = this.must('.contact-send');

    this.applyLabels();
    this.bindEvents();

    // Registered here, once per page: adding the face costs nothing (no
    // download until a matching glyph is painted), and doing it only when the
    // picker opens would leave agent messages with emoji rendered by the
    // platform font — the exact tofu the fill font exists to fix. The
    // unicode-range keeps the 1 MB download tied to an actual emoji on screen.
    void registerEmojiFont(this.assetBase()).catch(() => undefined);

    (this.options.target ?? document.body).appendChild(this.host);
  }

  private must<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);

    if (!element) {
      throw new Error(`Chat widget markup is missing ${selector}`);
    }

    return element;
  }

  private applyLabels(): void {
    this.launcher.setAttribute('aria-label', LABELS.launcherOpen);
    this.must<HTMLButtonElement>('.close').setAttribute('aria-label', LABELS.close);
    this.sendButton.setAttribute('aria-label', LABELS.send);
    this.emojiTrigger.setAttribute('aria-label', LABELS.emojiPicker);
    this.emojiTrigger.title = LABELS.emojiPicker;
    this.input.setAttribute('aria-label', LABELS.placeholder);
    this.input.placeholder = LABELS.placeholder;
    this.titleEl.textContent = this.options.title ?? LABELS.defaultTitle;
    this.loadOlderButton.textContent = LABELS.loadOlder;
    this.contactText.textContent = LABELS.contactIntro;
    this.contactName.placeholder = LABELS.contactName;
    this.contactName.setAttribute('aria-label', LABELS.contactName);
    this.contactEmail.placeholder = LABELS.contactEmail;
    this.contactEmail.setAttribute('aria-label', LABELS.contactEmail);
    this.contactSend.textContent = LABELS.contactSubmit;
  }

  private bindEvents(): void {
    this.launcher.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    this.must<HTMLButtonElement>('.close').addEventListener('click', () => this.close());

    this.input.addEventListener('input', () => {
      this.rememberSelection();
      this.onDraftChanged();
    });

    this.input.addEventListener('keydown', (event) => {
      // A Vietnamese IME uses Enter to commit the word being composed.
      if (event.isComposing || event.keyCode === 229) {
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.send();
        return;
      }

      // Arrows, Home, End, Backspace: any of them can move the caret, and the
      // selection is read on the next keyup so the picker inserts where the
      // visitor left off.
      this.rememberSelection();
    });

    // The trigger takes focus away from the textarea, so the caret has to be
    // captured while the composer still reports one.
    this.input.addEventListener('keyup', () => this.rememberSelection());
    this.input.addEventListener('click', () => this.rememberSelection());
    this.input.addEventListener('select', () => this.rememberSelection());
    this.input.addEventListener('blur', () => this.rememberSelection());

    this.emojiTrigger.addEventListener('click', () => this.toggleEmojiPicker());

    this.sendButton.addEventListener('click', () => void this.send());
    this.loadOlderButton.addEventListener('click', () => void this.loadOlder());

    this.contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitContact();
    });

    this.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.close();
      }
    });
  }

  /**
   * Everything that has to follow a change to the draft, whether it came from
   * typing or from `insertRangeText` — which does not fire `input` itself.
   */
  private onDraftChanged(): void {
    this.autoGrow();
    this.sendButton.disabled = !this.input.value.trim();
    this.notifyTyping();
  }

  /** Where the emoji dataset and font live; resolved once, shared by the font and the picker. */
  private assetBase(): string {
    // Normalised here too: an `assetBaseUrl` option passed without a trailing
    // slash would otherwise glue `emoji-data.json` onto the last segment.
    return resolveAssetBase(this.options.assetBaseUrl, undefined, this.options.apiUrl);
  }

  /** Saves the caret so the picker can put the emoji back where it belongs. */
  private rememberSelection(): void {
    const { selectionStart, selectionEnd } = this.input;

    if (selectionStart !== null && selectionEnd !== null) {
      this.draftSelection = { start: selectionStart, end: selectionEnd };
    }
  }

  /** Idempotent: `close()` is a no-op on an already closed picker. */
  private closeEmojiPicker(): void {
    this.picker?.close();
    this.emojiTrigger.setAttribute('aria-expanded', 'false');
  }

  private toggleEmojiPicker(): void {
    this.rememberSelection();

    if (!this.picker) {
      const picker = new EmojiPicker({
        assetBase: this.assetBase(),
        onPick: (emoji) => this.insertEmoji(emoji),
        onClose: (reason) => {
          this.emojiTrigger.setAttribute('aria-expanded', 'false');

          // A press elsewhere on the page belongs to the page: pulling focus
          // back into a hidden-in-a-shadow-root textarea would swallow whatever
          // the visitor clicked.
          if (reason === 'outside' || this.input.disabled) {
            return;
          }

          this.input.focus();
        },
      });

      this.emojiHost.append(picker.element);
      this.picker = picker;
    }

    // The picker's own outside-press listener ignores `data-emoji-trigger`, so
    // the two never fight over this click: it is opened here, and toggling an
    // already-open panel closes it here as well.
    this.picker.toggle();
    this.emojiTrigger.setAttribute('aria-expanded', String(this.picker.isOpen));
  }

  /**
   * Puts a glyph at the saved caret.
   *
   * Focus goes back to the textarea first: `setRangeText` on a control that is
   * not focused would still work, but the caret would only be correct after
   * the next focus.
   */
  private insertEmoji(emoji: string): void {
    // The picker can stay open while the composer is locked (maintenance, or
    // the socket dropping): inserting then would rewrite a disabled field and
    // light up a send button that cannot send.
    if (this.maintenance || this.input.disabled) {
      return;
    }

    const value = this.input.value;
    // A focused textarea reports the truth right now; the snapshot only has to
    // stand in once the trigger has taken focus away.
    const live = this.root.activeElement === this.input ? this.input : null;
    const from = live
      ? { start: live.selectionStart ?? value.length, end: live.selectionEnd ?? value.length }
      : this.draftSelection;
    const fallback = value.length;
    const start = Math.min(from?.start ?? fallback, value.length);
    const end = Math.min(from?.end ?? start, value.length);

    this.input.focus();
    this.input.setRangeText(emoji, start, end, 'end');

    const caret = start + emoji.length;

    this.draftSelection = { start: caret, end: caret };
    // `setRangeText` does not fire `input`, so the shared handler has to run.
    this.onDraftChanged();
  }

  open(): void {
    this.isOpen = true;
    this.panel.classList.add('open');
    this.launcher.setAttribute('aria-expanded', 'true');
    this.clearUnread();
    // The session (and therefore the visitor record) is created only once the
    // visitor actually opens the chat, so a plain page view costs nothing.
    void this.bootstrap().then(() => this.input.focus()).catch(() => {});
  }

  close(): void {
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.closeReactionBar();
    this.closeEmojiPicker();
    this.launcher.focus();
  }

  /** The picker is a child of the card, so it has to go when the card does. */
  destroy(): void {
    this.destroyed = true;
    if (this.availabilityTimer) clearInterval(this.availabilityTimer);
    this.socket?.close();
    this.socket = null;
    if (this.typingIdleTimer) clearTimeout(this.typingIdleTimer);
    if (this.agentTypingTimer) clearTimeout(this.agentTypingTimer);
    // Before the host is detached: the picker drops its document listener.
    this.picker?.destroy();
    this.picker = null;
    this.closeReactionBar();
    this.reactionsByMessage.clear();
    this.host.remove();
  }

  private bootstrap(): Promise<void> {
    this.bootstrapping ??= this.runBootstrap().catch((error: unknown) => {
      // Allow a later open() to retry rather than wedging on the failed attempt.
      this.bootstrapping = null;
      this.showError(LABELS.failed);
      throw error;
    });

    return this.bootstrapping;
  }

  private async runBootstrap(): Promise<void> {
    this.setStatus(LABELS.connecting);

    this.setMaintenance(false);
    const session = await createSession(this.options.apiUrl, this.options.publicKey);

    if (this.destroyed) {
      return;
    }

    this.session = session;
    this.rememberAgents(session.agents);
    // The assignee is who the visitor is waiting on; failing that, the last
    // person who wrote is the one they are talking to.
    this.activeAgent = session.assignedAgent ?? this.lastAgentOf(session.messages);
    this.hasOlder = session.hasMoreMessages;
    this.historyCursor = session.nextMessageCursor;
    this.contactCaptured = Boolean(session.contact.email);
    this.applySettings(session);
    this.applyAvailability(session.availability);
    this.renderHistory(session.messages);
    this.connectSocket(session.visitorToken);
    this.availabilityTimer = setInterval(() => {
      if (!this.isOpen) return;
      void fetchAvailability(this.options.apiUrl, session.visitorToken)
        .then((availability) => { if (!this.destroyed) this.applyAvailability(availability); })
        .catch(() => {});
    }, 60_000);
  }

  private applySettings(session: WidgetSession): void {
    // Custom properties inherit into the shadow tree, so setting it inline on
    // the host overrides the fallback in the :host rule.
    this.host.style.setProperty('--cc-theme', session.settings.themeColor);
    this.host.setAttribute('data-chat-center', 'ready');
    this.renderIdentity();
  }

  /**
   * Draws the header: the person handling the chat when there is one, the
   * project itself when there is not.
   *
   * A visitor wants to know who they are talking to, so a named agent with a
   * job title outranks the project logo and title once one is attached.
   */
  private renderIdentity(): void {
    const settings = this.session?.settings;
    const agent = this.activeAgent;

    this.titleEl.textContent =
      this.options.title ?? settings?.title ?? LABELS.defaultTitle;

    // "Tư vấn viên · Đang trực tuyến" — the role, then what it is doing.
    this.statusEl.textContent = [agent?.name, agent?.jobTitle, this.statusText]
      .filter((part): part is string => Boolean(part))
      .join(' · ');

    // Scoped to the header: message rows carry the same class.
    this.paintAvatar(
      this.must('.header .identity'),
      agent,
      agent ? undefined : settings?.imageUrl,
    );
  }

  /**
   * Fills an avatar slot with a picture, falling back to initials.
   *
   * The url is operator-provided and loads inside a stranger's page, so it is
   * pattern-checked before it reaches `src`, and a load failure reverts to the
   * initials rather than leaving a torn-image icon in the middle of a chat.
   */
  private paintAvatar(
    slot: HTMLElement,
    agent: AgentProfile | null,
    fallbackUrl?: string,
  ): void {
    const image = slot.querySelector('img');
    const initials = slot.querySelector('span');
    const url = agent?.avatarUrl ?? fallbackUrl ?? '';
    const label = agent?.name ?? this.session?.settings.title ?? '';

    if (initials) {
      initials.textContent = initialsOf(label);
    }

    if (!image) {
      return;
    }

    image.hidden = true;
    image.onload = () => { image.hidden = false; };
    image.onerror = () => { image.hidden = true; };

    if (SAFE_IMAGE_URL.test(url)) {
      image.src = url;
    } else {
      image.removeAttribute('src');
    }
  }

  /** Keeps the id → profile map fed from every source that carries profiles. */
  private rememberAgents(agents: AgentProfile[] | undefined | null): void {
    for (const agent of agents ?? []) {
      if (agent?.id) {
        this.agentsById.set(agent.id, agent);
      }
    }
  }

  private profileFor(message: ChatMessage): AgentProfile | null {
    if (message.senderKind !== 'agent') {
      return null;
    }

    if (message.sender) {
      return message.sender;
    }

    return message.senderId ? (this.agentsById.get(message.senderId) ?? null) : null;
  }

  private lastAgentOf(messages: ChatMessage[]): AgentProfile | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const profile = this.profileFor(messages[index]);

      if (profile) {
        return profile;
      }
    }

    return null;
  }

  /** Promotes whoever just wrote, or was just assigned, to the header. */
  private setActiveAgent(agent: AgentProfile | null): void {
    this.activeAgent = agent;
    this.renderIdentity();
  }

  private renderHistory(messages: ChatMessage[]): void {
    this.closeReactionBar();
    this.reactionsByMessage.clear();
    this.body.replaceChildren();
    this.loadOlderWrap.classList.toggle('visible', this.hasOlder);

    if (messages.length === 0 && this.session?.settings.greeting) {
      this.appendRow('system', this.session.settings.greeting);
    }

    for (const message of messages) {
      this.appendMessage(message);
    }

    this.groupAgentRows();

    this.scrollToBottom();
  }

  private connectSocket(token: string): void {
    const socket = io(this.session?.realtimeUrl || new URL(this.options.apiUrl, window.location.href).origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket = socket;

    socket.on('ready', (payload: { agentsOnline?: boolean }) => {
      const reconnected = this.hasHandshaked;
      this.hasHandshaked = true;
      this.connected = true;
      this.hideError();
      // The handshake carries presence as it is right now, which is fresher
      // than whatever the session response said a moment earlier.
      if (typeof payload?.agentsOnline === 'boolean' && this.availability) {
        this.applyAvailability({ ...this.availability, agentsOnline: payload.agentsOnline });
      } else {
        this.refreshStatus();
      }
      this.setComposerEnabled(true);

      // Events sent while the socket was down were never delivered, and both
      // messages and reactions are stored, so the newest page is the cheapest
      // way to agree with the server again.
      if (reconnected) {
        void this.resyncThread();
      }
    });

    // Sent when a member of staff picks the thread up or lets it go, so the
    // header can name them before they have written anything.
    socket.on('agent:assigned', (payload: { agent: AgentProfile | null }) => {
      if (payload?.agent) {
        this.rememberAgents([payload.agent]);
        this.setActiveAgent(payload.agent);
      } else {
        this.setActiveAgent(this.lastAgentOf(this.session?.messages ?? []));
      }
    });

    socket.on('widget:maintenance', (payload: { maintenance: boolean }) => this.setMaintenance(payload.maintenance));

    socket.on('presence', (payload: { agentsOnline: boolean }) => {
      if (this.availability) {
        this.applyAvailability({ ...this.availability, agentsOnline: payload.agentsOnline });
      }
    });

    socket.on('disconnect', () => {
      this.connected = false;
      this.refreshStatus();
      this.setComposerEnabled(false);
    });

    socket.on('connect_error', () => {
      this.connected = false;
      this.refreshStatus();
      this.setComposerEnabled(false);
    });

    socket.on('error:auth', () => {
      this.showError(LABELS.failed);
      this.setComposerEnabled(false);
    });

    socket.on('message:new', (message: ChatMessage) => {
      if (message.sender) {
        this.rememberAgents([message.sender]);
        this.setActiveAgent(message.sender);
      }

      this.appendMessage(message);
      this.scrollToBottom();

      if (message.senderKind !== 'visitor') {
        this.hideAgentTyping();

        if (!this.isOpen) {
          this.bumpUnread();
        }
      }
    });

    socket.on('typing', (payload: { from: string; isTyping: boolean }) => {
      if (payload.from === 'agent') {
        this.setAgentTyping(payload.isTyping);
      }
    });

    // Reactions can arrive from an agent while the visitor is reading, so the
    // badges are repainted from the same payload the ack carries.
    socket.on(
      'message:reactions',
      (payload: { messageId?: string; conversationId?: string; reactions?: MessageReaction[] }) => {
        if (
          !payload ||
          typeof payload.messageId !== 'string' ||
          payload.conversationId !== this.session?.conversationId
        ) {
          return;
        }

        this.applyReactions(
          payload.messageId,
          Array.isArray(payload.reactions) ? payload.reactions : [],
        );
      },
    );
  }

  /**
   * Re-reads the persisted thread after a reconnect and folds it into what is
   * on screen: missed messages are slotted into their place, and a message that
   * is already shown gets the server's current reaction list. Anything the
   * visitor typed in the meantime is kept.
   */
  private async resyncThread(): Promise<void> {
    if (!this.session) {
      return;
    }

    // A drop that happens while a pass is in flight must not be skipped: the
    // snapshot being read started before that drop, so it cannot contain what
    // arrived during it. Ask for one more pass instead.
    if (this.resyncing) {
      this.resyncPending = true;
      return;
    }

    this.resyncing = true;

    try {
      do {
        this.resyncPending = false;
        await this.resyncOnce();
      } while (this.resyncPending && this.connected && !this.destroyed);
    } finally {
      this.resyncing = false;
    }
  }

  /** One read of the persisted thread, folded into what is on screen. */
  private async resyncOnce(): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const body = this.body;
    const wasAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    const known = new Set(
      [...body.querySelectorAll<HTMLElement>('[data-message-id]')].map(
        (row) => row.dataset.messageId ?? '',
      ),
    );
    const loaded: ChatMessage[] = [];

    try {
      let before: string | null = null;

      // Walk back until a page overlaps what is already on screen, so a gap
      // larger than one page is filled rather than truncated. Past the page cap
      // the deepest part of the hole is left unread, which the history cursor
      // still covers.
      for (let page = 0; page < RESYNC_MAX_PAGES; page += 1) {
        const result: WidgetMessagePage = before
          ? await fetchOlderMessages(this.options.apiUrl, session.visitorToken, before)
          : await fetchRecentMessages(this.options.apiUrl, session.visitorToken);

        this.rememberAgents(result.agents);
        loaded.push(...result.messages);

        if (result.messages.some((message) => known.has(message.id))) break;

        if (!result.hasMore || !result.nextCursor || result.nextCursor === before) break;

        before = result.nextCursor;
      }
    } catch {
      // The next reconnect tries again; an extra error over a chat that already
      // works offline would be noise.
    }

    if (this.destroyed) {
      this.bufferedReactions.clear();
      return;
    }

    for (const message of loaded) {
      if (known.has(message.id)) {
        this.renderReactionsFor(message.id, message.reactions ?? []);
      } else {
        this.insertMessage(message);
      }
    }

    // Whatever was seen live is newer than the fetched page, so it is replayed
    // last — and never dropped, even when the fetch itself failed.
    for (const [messageId, reactions] of this.bufferedReactions) {
      this.renderReactionsFor(messageId, reactions);
    }

    this.bufferedReactions.clear();
    this.groupAgentRows();

    // A visitor reading old messages should not be yanked to the bottom, and a
    // visitor at the bottom should see what just arrived.
    if (this.connected && wasAtBottom) {
      this.scrollToBottom();
    }
  }

  /**
   * Status and the out-of-hours notice are two views of the same state, so
   * they are set together whenever availability changes.
   */
  private applyAvailability(availability: WidgetAvailability): void {
    this.availability = availability;
    this.setMaintenance(Boolean(availability.maintenance));
    this.refreshStatus();

    const outsideHours = !availability.withinOfficeHours;

    if (outsideHours && availability.offlineMessage && !this.offlineNoticeShown) {
      this.appendRow('system', availability.offlineMessage);
      this.scrollToBottom();
      this.offlineNoticeShown = true;
    }

    // Asking for an email only makes sense when nobody will answer right now
    // and the visitor has not already left one.
    this.contactForm.classList.toggle('visible', outsideHours && !this.contactCaptured && !this.maintenance);
  }

  private refreshStatus(): void {
    if (this.maintenance) { this.setStatus('Đang bảo trì'); return; }
    if (!this.connected) {
      this.setStatus(LABELS.offline);
      return;
    }

    if (this.availability?.withinOfficeHours === false) {
      this.setStatus(LABELS.outsideHours);
      return;
    }

    if (this.availability?.agentsOnline) {
      this.setStatus(LABELS.online);
      return;
    }

    this.setStatus(LABELS.away);
  }

  /** Pulls one page of older history and prepends it, keeping the view steady. */
  private async loadOlder(): Promise<void> {
    const oldest = this.body.querySelector<HTMLElement>('[data-created-at]');
    const before = this.historyCursor ?? oldest?.dataset.createdAt;

    if (!this.session || !before || this.loadingOlder) {
      return;
    }

    this.loadingOlder = true;
    this.loadOlderButton.disabled = true;
    this.loadOlderButton.textContent = LABELS.loadingOlder;

    try {
      const page = await fetchOlderMessages(
        this.options.apiUrl,
        this.session.visitorToken,
        before,
      );
      const anchorOffset = this.body.scrollHeight - this.body.scrollTop;

      this.rememberAgents(page.agents);

      // Inserted in reverse so each one lands above the previous insert.
      for (const message of [...page.messages].reverse()) {
        this.body.prepend(this.buildRow(message));
      }

      this.groupAgentRows();
      this.hasOlder = page.hasMore;
      this.historyCursor = page.nextCursor;
      this.loadOlderWrap.classList.toggle('visible', this.hasOlder);
      this.body.scrollTop = this.body.scrollHeight - anchorOffset;
    } catch {
      this.showError(LABELS.failed);
    } finally {
      this.loadingOlder = false;
      this.loadOlderButton.disabled = false;
      this.loadOlderButton.textContent = LABELS.loadOlder;
    }
  }

  private async submitContact(): Promise<void> {
    const email = this.contactEmail.value.trim();
    const name = this.contactName.value.trim();

    if (!this.session || !email) {
      return;
    }

    this.contactSend.disabled = true;

    try {
      await saveContact(this.options.apiUrl, this.session.visitorToken, {
        ...(name ? { name } : {}),
        email,
      });

      this.contactCaptured = true;
      this.session.contact = { name: name || null, email };
      this.contactForm.classList.remove('visible');
      this.appendRow('system', LABELS.contactThanks);
      this.scrollToBottom();
      this.hideError();
    } catch {
      this.showError(LABELS.contactInvalid);
    } finally {
      this.contactSend.disabled = false;
    }
  }

  private async send(): Promise<void> {
    const body = this.input.value.trim();

    if (this.maintenance || !body || !this.socket?.connected) {
      return;
    }

    this.input.value = '';
    this.draftSelection = { start: 0, end: 0 };
    this.autoGrow();
    this.sendButton.disabled = true;
    this.stopTyping();

    const ack = (await this.socket.emitWithAck('message:send', { body }).catch(() => null)) as
      | { ok: boolean; error?: string }
      | null;

    if (!ack?.ok) {
      // Hand the text back so nothing the visitor typed is silently lost — but
      // only into an empty composer. If they have already started the next
      // message, overwriting it with the failed one would delete that work.
      if (!this.input.value) {
        this.input.value = body;
        this.draftSelection = { start: body.length, end: body.length };
        this.autoGrow();
        this.sendButton.disabled = false;
      }

      this.showError(ack?.error ?? LABELS.failed);
      return;
    }

    this.hideError();
  }

  private notifyTyping(): void {
    if (!this.socket?.connected) {
      return;
    }

    const now = Date.now();

    if (now - this.lastTypingSentAt > TYPING_THROTTLE_MS) {
      this.lastTypingSentAt = now;
      this.socket.emit('typing', { isTyping: true });
    }

    if (this.typingIdleTimer) {
      clearTimeout(this.typingIdleTimer);
    }

    this.typingIdleTimer = setTimeout(() => this.stopTyping(), TYPING_IDLE_MS);
  }

  private stopTyping(): void {
    if (this.typingIdleTimer) {
      clearTimeout(this.typingIdleTimer);
      this.typingIdleTimer = null;
    }

    this.lastTypingSentAt = 0;
    this.socket?.emit('typing', { isTyping: false });
  }

  private setAgentTyping(isTyping: boolean): void {
    if (this.agentTypingTimer) {
      clearTimeout(this.agentTypingTimer);
      this.agentTypingTimer = null;
    }

    this.typingEl.textContent = isTyping ? LABELS.agentTyping : '';
    this.typingEl.classList.toggle('visible', isTyping);

    if (isTyping) {
      // Safety net in case the "stopped typing" event never arrives.
      this.agentTypingTimer = setTimeout(() => this.hideAgentTyping(), TYPING_IDLE_MS * 3);
    }
  }

  private hideAgentTyping(): void {
    this.setAgentTyping(false);
  }

  private appendMessage(message: ChatMessage): void {
    if ([...this.body.querySelectorAll<HTMLElement>('[data-message-id]')].some((row) => row.dataset.messageId === message.id)) return;
    this.body.append(this.buildRow(message));
    this.groupAgentRows();
  }

  /**
   * Puts a message read back from the server in its place, which after a
   * reconnect can be anywhere in the thread rather than at the end.
   */
  private insertMessage(message: ChatMessage): void {
    const rows = [...this.body.querySelectorAll<HTMLElement>('[data-message-id]')];

    if (rows.some((row) => row.dataset.messageId === message.id)) {
      return;
    }

    const after = rows.find(
      (row) =>
        (row.dataset.createdAt ?? '') > message.createdAt ||
        (row.dataset.createdAt === message.createdAt &&
          (row.dataset.messageId ?? '') > message.id),
    );

    const row = this.buildRow(message);

    if (after) {
      after.before(row);
    } else {
      this.body.append(row);
    }

    this.groupAgentRows();
  }

  /**
   * A row for a stored message. It carries the timestamp, which is how paging
   * backwards knows where the thread currently starts; system notices written
   * by the widget itself have none and are skipped by that lookup.
   */
  private buildRow(message: ChatMessage): HTMLDivElement {
    const profile = this.profileFor(message);
    const row = this.createRow(
      message.senderKind,
      message.body,
      // The name stored on the message is the one in force when it was sent,
      // and it outlives the account, so it wins over the live profile.
      message.senderName ?? profile?.name ?? (message.senderKind === 'visitor' ? (this.session?.contact.name || this.session?.contact.email || 'Khách') : 'Nhân viên hỗ trợ'),
      profile,
    );
    row.dataset.createdAt = message.createdAt;
    row.dataset.messageId = message.id;

    if (message.senderKind === 'agent' && message.senderId) {
      row.dataset.senderId = message.senderId;
    }

    // System notices ("đã đóng hội thoại") are not a person's words; a reaction
    // on them would have nowhere to show.
    if (message.senderKind !== 'system') {
      this.attachReactions(row, message.reactions ?? []);
    }

    return row;
  }

  /**
   * Adds the badge line and the picker bar under a message.
   *
   * The bar is a plain child of the row rather than a floating popover: the
   * message list clips its children, so anything positioned above a bubble
   * would be cut off on the first visible row.
   */
  private attachReactions(row: HTMLDivElement, reactions: MessageReaction[]): void {
    row.classList.add('reactable');

    const extra = document.createElement('div');
    extra.className = 'row-extra';

    const badges = document.createElement('div');
    badges.className = 'reactions';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'react-trigger';
    trigger.setAttribute('aria-label', LABELS.react);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = ICONS.smile;
    trigger.addEventListener('click', () => this.toggleReactionBar(row));

    const bar = document.createElement('div');
    bar.className = 'react-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', LABELS.react);

    for (const emoji of QUICK_REACTIONS) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'react-choice';
      choice.textContent = emoji;
      choice.title = `${LABELS.react} ${emoji}`;
      choice.addEventListener('click', () => {
        const messageId = row.dataset.messageId ?? '';
        const mine = this.myReaction(this.reactionsByMessage.get(messageId) ?? []);
        this.closeReactionBar();
        this.focusTrigger(row);
        void this.sendReaction(messageId, mine === emoji ? '' : emoji);
      });
      bar.append(choice);
    }

    badges.append(trigger);
    extra.append(badges, bar);
    row.append(extra);

    this.renderReactions(row, reactions);
  }

  /** Renders the badge line, keeping the trigger last so it never jumps around. */
  private renderReactions(row: HTMLElement, reactions: MessageReaction[]): void {
    const badges = row.querySelector<HTMLDivElement>('.reactions');

    if (!badges) {
      return;
    }

    const trigger = badges.querySelector('.react-trigger');

    if (row.dataset.messageId) {
      this.reactionsByMessage.set(row.dataset.messageId, reactions);
    }

    // Grouped in first-seen order: the set is tiny, and an order that changes
    // as counts change would make the badges hop under the pointer.
    const totals = new Map<string, { count: number; mine: boolean }>();

    for (const reaction of reactions) {
      const entry = totals.get(reaction.emoji) ?? { count: 0, mine: false };
      entry.count += 1;

      if (reaction.kind === 'visitor' && reaction.id === this.session?.visitorId) {
        entry.mine = true;
      }

      totals.set(reaction.emoji, entry);
    }

    // A repaint must not drop the keyboard user out of the thread, and the badge
    // they were on may have just been removed. Read before the old nodes go, and
    // only when the focus is inside this row's badge line.
    const active = this.root.activeElement;
    const focusedEmoji =
      active instanceof HTMLElement &&
      badges.contains(active) &&
      active.classList.contains('reaction-badge')
        ? (active.dataset.emoji ?? null)
        : null;

    for (const badge of [...badges.querySelectorAll('.reaction-badge')]) {
      badge.remove();
    }

    for (const [emoji, entry] of totals) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = entry.mine ? 'reaction-badge mine' : 'reaction-badge';
      badge.dataset.emoji = emoji;
      badge.title = entry.mine ? LABELS.reactMine : LABELS.react;
      badge.setAttribute('aria-label', `${emoji} ${entry.count}`);
      badge.setAttribute('aria-pressed', String(entry.mine));

      const glyph = document.createElement('span');
      glyph.className = 'reaction-glyph';
      glyph.textContent = emoji;

      const count = document.createElement('span');
      count.className = 'reaction-count';
      count.textContent = String(entry.count);

      badge.append(glyph, count);
      badge.addEventListener('click', () => {
        const messageId = row.dataset.messageId ?? '';
        const current = this.myReaction(this.reactionsByMessage.get(messageId) ?? []);
        this.closeReactionBar();
        void this.sendReaction(messageId, current === emoji ? '' : emoji);
      });

      badges.insertBefore(badge, trigger);
    }

    row.classList.toggle('has-reactions', totals.size > 0);

    if (focusedEmoji !== null) {
      const replacement = badges.querySelector<HTMLElement>(
        `.reaction-badge[data-emoji="${CSS.escape(focusedEmoji)}"]`,
      );

      if (replacement) {
        replacement.focus({ preventScroll: true });
      } else {
        this.focusTrigger(row);
      }
    }
  }

  /** The reaction belonging to this visitor, if any. */
  private myReaction(reactions: MessageReaction[]): string | null {
    const visitorId = this.session?.visitorId;

    if (!visitorId) {
      return null;
    }

    return (
      reactions.find((reaction) => reaction.kind === 'visitor' && reaction.id === visitorId)
        ?.emoji ?? null
    );
  }

  private toggleReactionBar(row: HTMLDivElement): void {
    if (this.reactingRow === row) {
      this.closeReactionBar();
      return;
    }

    this.closeReactionBar();
    row.classList.add('react-open');
    row.querySelector('.react-trigger')?.setAttribute('aria-expanded', 'true');
    this.reactingRow = row;
    // Captured on the document so a press anywhere — including the host page —
    // dismisses the bar; the shadow boundary hides it from bubbling listeners.
    document.addEventListener('pointerdown', this.onReactionPointerDown, true);
  }

  private closeReactionBar(): void {
    if (this.reactingRow) {
      this.reactingRow.classList.remove('react-open');
      this.reactingRow.querySelector('.react-trigger')?.setAttribute('aria-expanded', 'false');
    }

    this.reactingRow = null;
    document.removeEventListener('pointerdown', this.onReactionPointerDown, true);
  }

  /**
   * Picking from the bar hides the button that had focus, so keyboard users
   * would otherwise be dropped back at the top of the document.
   */
  private focusTrigger(row: HTMLElement): void {
    row.querySelector<HTMLButtonElement>('.react-trigger')?.focus({ preventScroll: true });
  }

  private readonly onReactionPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();

    if (this.reactingRow && path.includes(this.reactingRow)) {
      return;
    }

    this.closeReactionBar();
  };

  /**
   * Sends the reaction and repaints from the ack. There is no optimistic update:
   * the write is one round trip, and painting before the server agrees would
   * leave a badge that silently disappears when the ack fails.
   */
  private async sendReaction(messageId: string, emoji: string): Promise<void> {
    const socket = this.socket;

    if (!socket || !this.connected || !messageId) {
      return;
    }

    const ack = (await socket
      .timeout(8000)
      .emitWithAck('message:react', { messageId, emoji })
      .catch(() => null)) as { ok?: boolean; reactions?: MessageReaction[] } | null;

    if (!ack?.ok || !Array.isArray(ack.reactions)) {
      return;
    }

    this.applyReactions(messageId, ack.reactions);
  }

  private applyReactions(messageId: string, reactions: MessageReaction[]): void {
    if (this.resyncing) {
      this.bufferedReactions.set(messageId, reactions);
      return;
    }

    this.renderReactionsFor(messageId, reactions);
  }

  /** Paints the badges of one row, without the resync buffering. */
  private renderReactionsFor(messageId: string, reactions: MessageReaction[]): void {
    const row = [...this.body.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      (candidate) => candidate.dataset.messageId === messageId,
    );

    if (row) {
      this.renderReactions(row, reactions);
    }
  }

  private appendRow(kind: string, body: string, senderName?: string): void {
    this.body.append(this.createRow(kind, body, senderName));
  }

  private createRow(
    kind: string,
    body: string,
    senderName?: string,
    profile?: AgentProfile | null,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = `row from-${kind}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    // textContent, so message text can never be parsed as markup.
    bubble.textContent = body;

    if (kind === 'system') {
      row.append(bubble);

      return row;
    }

    const sender = document.createElement('div');
    sender.className = 'sender';

    const name = document.createElement('span');
    name.className = 'sender-name';
    name.textContent = senderName || (kind === 'visitor' ? 'Khách' : 'Nhân viên hỗ trợ');
    sender.append(name);

    if (profile?.jobTitle) {
      const title = document.createElement('span');
      title.className = 'sender-title';
      title.textContent = profile.jobTitle;
      sender.append(title);
    }

    const main = document.createElement('div');
    main.className = 'row-main';
    main.append(sender, bubble);

    row.append(main);

    return row;
  }

  /**
   * Hides the name and face on an agent message that follows another from the
   * same person, so a burst of replies reads as one turn instead of repeating
   * the same header three times. Re-run after every insert, which keeps it
   * right whether rows arrive at the bottom or are prepended at the top.
   */
  private groupAgentRows(): void {
    let previousSender: string | null = null;

    for (const row of this.body.querySelectorAll<HTMLElement>('.row')) {
      const sender = row.classList.contains('from-agent')
        ? (row.dataset.senderId ?? '')
        : null;

      row.classList.toggle('grouped', sender !== null && sender === previousSender);
      previousSender = sender;
    }
  }

  private setMaintenance(value: boolean): void {
    this.maintenance = value;
    if (value) this.closeEmojiPicker();
    let notice = this.root.querySelector<HTMLDivElement>('.maintenance-notice');
    if (!notice) { notice = document.createElement('div'); notice.className = 'maintenance-notice'; notice.setAttribute('role', 'status'); this.body.before(notice); }
    notice.textContent = 'Hệ thống chat đang bảo trì. Vui lòng quay lại sau.';
    notice.hidden = !value;
    this.setComposerEnabled(this.connected);
    if (value) { this.contactForm.classList.remove('visible'); this.setStatus('Đang bảo trì'); }
    else this.refreshStatus();
  }

  private setComposerEnabled(enabled: boolean): void {
    enabled = enabled && !this.maintenance;
    this.input.disabled = !enabled;
    // A locked composer cannot take a glyph, so the trigger is closed off too
    // rather than opening a panel of buttons that do nothing.
    this.emojiTrigger.disabled = !enabled;
    if (!enabled) this.closeEmojiPicker();
    this.sendButton.disabled = !enabled || !this.input.value.trim();
  }

  private setStatus(text: string): void {
    this.statusText = text;
    // The status shares its line with the job title, so it is composed there.
    this.renderIdentity();
  }

  private showError(text: string): void {
    this.errorEl.textContent = text;
    this.errorEl.classList.add('visible');
  }

  private hideError(): void {
    this.errorEl.classList.remove('visible');
  }

  private bumpUnread(): void {
    this.unread += 1;
    this.badge.textContent = this.unread > 9 ? '9+' : String(this.unread);
    this.badge.classList.add('visible');
  }

  private clearUnread(): void {
    this.unread = 0;
    this.badge.classList.remove('visible');
  }

  private autoGrow(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 96)}px`;
  }

  private scrollToBottom(): void {
    this.body.scrollTop = this.body.scrollHeight;
  }
}
