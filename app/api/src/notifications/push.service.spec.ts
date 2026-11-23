import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { PushService } from './push.service.js';

/**
 * `web-push` is a network client; the point of these tests is what the service
 * does with its answer, so the transport is the only thing stubbed.
 */
const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock('web-push', () => ({ sendNotification, setVapidDetails }));

const VAPID = {
  VAPID_PUBLIC_KEY: 'BPublicKeyForTests',
  VAPID_PRIVATE_KEY: 'private-key-for-tests',
  VAPID_SUBJECT: 'mailto:ops@example.test',
};

function config(values: Record<string, string | undefined>) {
  return new ConfigService(values);
}

/** A subscription document, reduced to what `sendOne` reads. */
function subscription(endpoint: string) {
  return {
    endpoint,
    keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
  };
}

/** A Mongoose query returning a list, typed so the mock is not `never[]`. */
function list<T>(value: T[]): { exec: () => Promise<T[]> } {
  return { exec: () => Promise.resolve(value) };
}

function harness(values: Record<string, string | undefined> = VAPID) {
  const model = {
    find: vi.fn(() => list<unknown>([])),
    deleteOne: vi.fn(() => list<unknown>([])),
    updateOne: vi.fn(() => list<unknown>([])),
  };
  const presence = { isUserConnected: vi.fn().mockResolvedValue(false) };
  const service = new PushService(
    model as never,
    config(values),
    presence as never,
  );

  return { service, model, presence };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PushService configuration', () => {
  it('disables itself when any VAPID value is missing', async () => {
    for (const missing of [
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_SUBJECT',
    ]) {
      const values: Record<string, string | undefined> = { ...VAPID };
      values[missing] = undefined;

      const h = harness(values);

      expect(h.service.publicKey()).toBeNull();
    }

    // Nothing was announced as a VAPID sender, and nothing was attempted.
    expect(setVapidDetails).not.toHaveBeenCalled();
  });

  it('a disabled service sends nothing at all, not even a presence lookup', async () => {
    const h = harness({ ...VAPID, VAPID_PRIVATE_KEY: '' });
    h.model.find.mockReturnValue(list([subscription('https://push.test/a')]));

    await expect(
      h.service.sendToUser('507f1f77bcf86cd799440201', {
        title: 'Tin nhắn mới',
        body: 'xin chào',
      }),
    ).resolves.toBeUndefined();

    expect(h.presence.isUserConnected).not.toHaveBeenCalled();
    expect(h.model.find).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('exposes the public key and registers the VAPID details once configured', () => {
    const h = harness();

    expect(h.service.publicKey()).toBe(VAPID.VAPID_PUBLIC_KEY);
    expect(setVapidDetails).toHaveBeenCalledWith(
      VAPID.VAPID_SUBJECT,
      VAPID.VAPID_PUBLIC_KEY,
      VAPID.VAPID_PRIVATE_KEY,
    );
  });
});

describe('PushService.sendToUser', () => {
  const USER = '507f1f77bcf86cd799440201';
  const payload = { title: 'Tin nhắn mới · An', body: 'shop ơi' };

  it('stays quiet while the person has a socket open somewhere', async () => {
    const h = harness();
    h.presence.isUserConnected.mockResolvedValue(true);

    await h.service.sendToUser(USER, payload);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(h.model.find).not.toHaveBeenCalled();
  });

  it('treats unknown presence as "probably here" rather than buzzing the phone', async () => {
    const h = harness();
    h.presence.isUserConnected.mockResolvedValue(null);

    await h.service.sendToUser(USER, payload);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(h.model.find).not.toHaveBeenCalled();
  });

  it('rings every device when the person is definitely offline', async () => {
    const h = harness();
    h.presence.isUserConnected.mockResolvedValue(false);
    h.model.find.mockReturnValue(
      list([
        subscription('https://push.test/a'),
        subscription('https://push.test/b'),
      ]),
    );

    await h.service.sendToUser(USER, payload);

    expect(h.model.find).toHaveBeenCalledWith({ userId: USER });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification.mock.calls[0]).toEqual([
      { endpoint: 'https://push.test/a', keys: { p256dh: 'p256dh-value', auth: 'auth-value' } },
      JSON.stringify(payload),
      { TTL: 3600, urgency: 'high' },
    ]);
  });

  it('deletes the subscription the push service says is gone (410 and 404)', async () => {
    for (const statusCode of [404, 410]) {
      vi.clearAllMocks();

      const h = harness();
      h.presence.isUserConnected.mockResolvedValue(false);
      h.model.find.mockReturnValue(
        list([subscription('https://push.test/dead')]),
      );
      sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }));

      await h.service.sendToUser(USER, payload);

      expect(h.model.deleteOne).toHaveBeenCalledWith({
        endpoint: 'https://push.test/dead',
      });
    }
  });

  it('never throws on any other failure, so the message path is untouched', async () => {
    const h = harness();
    h.presence.isUserConnected.mockResolvedValue(false);
    h.model.find.mockReturnValue(
      list([subscription('https://push.test/live')]),
    );
    sendNotification.mockRejectedValue(
      Object.assign(new Error('internal server error'), { statusCode: 500 }),
    );

    await expect(h.service.sendToUser(USER, payload)).resolves.toBeUndefined();

    // A live endpoint that merely failed once keeps its row.
    expect(h.model.deleteOne).not.toHaveBeenCalled();
  });
});
