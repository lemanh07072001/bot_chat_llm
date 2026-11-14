import { Injectable } from '@nestjs/common';

interface Window {
  count: number;
  /** Epoch ms when this window stops counting. */
  resetAt: number;
}

/** Entries are dropped lazily; this bounds the sweep's cost. */
const SWEEP_EVERY = 500;

/**
 * Fixed-window counter keyed by whatever the caller considers an identity.
 *
 * The point of the key is that it must not be the socket: an earlier version
 * counted per connection, which anybody could sidestep by opening a second
 * socket — or twenty. Keying on the visitor, the user or the IP makes the
 * limit mean something.
 *
 * In-process, so with several api instances each enforces its own share of the
 * limit. Moving it behind Redis is the same piece of work as the socket.io
 * Redis adapter and is tracked with it.
 */
@Injectable()
export class RateLimiterService {
  private readonly windows = new Map<string, Window>();
  private sinceSweep = 0;

  /**
   * Counts one hit against `key` and says whether it is allowed. Returns false
   * once the window is full, without extending it, so a client that keeps
   * hammering is not punished with an ever-growing block.
   */
  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();

    this.maybeSweep(now);

    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (existing.count >= limit) {
      return false;
    }

    existing.count += 1;

    return true;
  }

  /** Seconds until `key` is allowed again; 0 when it already is. */
  retryAfterSeconds(key: string): number {
    const existing = this.windows.get(key);

    if (!existing) {
      return 0;
    }

    return Math.max(0, Math.ceil((existing.resetAt - Date.now()) / 1000));
  }

  private maybeSweep(now: number): void {
    this.sinceSweep += 1;

    if (this.sinceSweep < SWEEP_EVERY) {
      return;
    }

    this.sinceSweep = 0;

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
