/**
 * Everything the widget does outside its own card when an agent writes while
 * the visitor is not looking: a soft chime and a blinking page title.
 *
 * A browser refuses both until the page has had a user gesture, so the audio
 * context is created on the first pointer/key press and nothing before that.
 * Every call fails silently — a missing chime must never break the chat.
 */

export interface WidgetNotificationEffectOptions {
  /** Off via `notifySound: false` / `data-notify-sound="false"`. */
  sound: boolean;
  /** Off via `notifyTitle: false` / `data-notify-title="false"`. */
  title: boolean;
}

const BLINK_MS = 1200;

export class WidgetNotificationEffects {
  private readonly sound: boolean;
  private readonly title: boolean;

  private context: AudioContext | null = null;
  private unlocked = false;

  private originalTitle: string | null = null;
  /** True while the title on screen is the widget's own label, not the host's. */
  private showingLabel = false;
  /** The exact string we last wrote, so a stale label is never read as the host's. */
  private lastWritten: string | null = null;
  private count = 0;
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(options: WidgetNotificationEffectOptions) {
    this.sound = options.sound;
    this.title = options.title;

    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    window.addEventListener('touchstart', this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Chime and, while the tab is hidden, start the title blink. */
  notify(count: number): void {
    if (this.destroyed) return;

    this.count = Math.max(0, count);

    if (this.count === 0) {
      this.restoreTitle();
      return;
    }

    this.playChime();

    if (this.title && document.hidden) {
      this.startBlink();
    }
  }

  /** Puts the host's own title back and stops blinking. Idempotent. */
  restoreTitle(): void {
    if (this.showingLabel) {
      // Only undo it when our label is still up: a title the host set in the
      // meantime is not ours to overwrite.
      if (document.title === this.lastWritten) {
        document.title = this.originalTitle ?? '';
      } else {
        this.originalTitle = document.title;
      }

      this.showingLabel = false;
      this.lastWritten = null;
    }

    this.stopBlink();
  }

  destroy(): void {
    this.destroyed = true;
    this.restoreTitle();

    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
    window.removeEventListener('touchstart', this.onGesture, true);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const context = this.context;
    this.context = null;
    void context?.close().catch(() => undefined);
  }

  private label(): string {
    return `(${this.count}) Tin nhắn mới`;
  }

  private readonly onGesture = (): void => {
    if (this.unlocked) return;

    const context = this.audioContext();

    if (!context) return;

    // Only now is a chime possible, so only now is the listener done.
    this.unlocked = true;
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
    window.removeEventListener('touchstart', this.onGesture, true);
    void context.resume().catch(() => undefined);
  };

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.restoreTitle();
  };

  private audioContext(): AudioContext | null {
    if (this.destroyed) return null;

    try {
      this.context ??= new AudioContext();
      return this.context;
    } catch {
      return null;
    }
  }

  /** Two short, quiet notes — a doorbell rather than an alarm. */
  private playChime(): void {
    if (!this.sound) return;

    // A gesture may have happened before the script ran, in which case the
    // unlock listener below never saw it; the browser still remembers.
    if (!this.unlocked && !navigator.userActivation?.hasBeenActive) return;

    const context = this.audioContext();

    if (!context) return;

    if (context.state !== 'running') {
      // Too late to start it from this call: the next message tries again.
      void context.resume().catch(() => undefined);
      return;
    }

    try {
      const start = context.currentTime;

      for (const [offset, frequency] of [[0, 660], [0.11, 880]] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.05, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.2);
      }
    } catch {
      // Autoplay policy or a closed context: the badge still tells the story.
    }
  }

  private startBlink(): void {
    if (this.blinkTimer !== null) {
      this.tickBlink();
      return;
    }

    this.originalTitle = document.title;
    this.showingLabel = false;
    this.blinkTimer = setInterval(() => this.tickBlink(), BLINK_MS);
    this.tickBlink();
  }

  private tickBlink(): void {
    const label = this.label();
    const current = document.title;

    if (this.showingLabel) {
      // A title that is neither our label nor the remembered original was set
      // by the host while the label was up, so that is what to come back to.
      if (current !== label && current !== this.lastWritten) this.originalTitle = current;

      document.title = this.originalTitle ?? '';
      this.showingLabel = false;
      this.lastWritten = null;
      return;
    }

    if (current !== (this.originalTitle ?? '') && current !== this.lastWritten) this.originalTitle = current;

    document.title = label;
    this.showingLabel = true;
    this.lastWritten = label;
  }

  private stopBlink(): void {
    if (this.blinkTimer !== null) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
  }
}
