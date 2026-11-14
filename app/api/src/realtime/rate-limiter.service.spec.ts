import { vi } from 'vitest';
import { RateLimiterService } from './rate-limiter.service.js';

describe('RateLimiterService', () => {
  let limiter: RateLimiterService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    limiter = new RateLimiterService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to the limit and then refuses', () => {
    expect(limiter.consume('a', 3, 1000)).toBe(true);
    expect(limiter.consume('a', 3, 1000)).toBe(true);
    expect(limiter.consume('a', 3, 1000)).toBe(true);
    expect(limiter.consume('a', 3, 1000)).toBe(false);
  });

  it('counts each key on its own, which is what makes a per-identity cap work', () => {
    expect(limiter.consume('visitor:1', 1, 1000)).toBe(true);
    expect(limiter.consume('visitor:1', 1, 1000)).toBe(false);
    // A different identity is unaffected — the point being that a second
    // socket for the same identity would not get a fresh allowance.
    expect(limiter.consume('visitor:2', 1, 1000)).toBe(true);
  });

  it('starts a fresh window once the old one has passed', () => {
    expect(limiter.consume('a', 1, 1000)).toBe(true);
    expect(limiter.consume('a', 1, 1000)).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(limiter.consume('a', 1, 1000)).toBe(true);
  });

  it('does not extend the window while a blocked client keeps trying', () => {
    limiter.consume('a', 1, 1000);
    limiter.consume('a', 1, 1000);

    vi.advanceTimersByTime(900);
    limiter.consume('a', 1, 1000);

    expect(limiter.retryAfterSeconds('a')).toBe(1);

    vi.advanceTimersByTime(200);

    expect(limiter.consume('a', 1, 1000)).toBe(true);
  });

  it('reports no wait for a key it has never seen', () => {
    expect(limiter.retryAfterSeconds('unknown')).toBe(0);
  });
});
