import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubscribePushDto, UnsubscribePushDto } from './push.dto.js';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const KEYS = { p256dh: 'BOr8dYnr3X_p256dh-key', auth: 'auth-key-1234' };

/**
 * The endpoint is validated in the DTO rather than the controller because the
 * server is the one making the request, so the rule is an allowlist of the push
 * services themselves: loopback, private hosts *and* arbitrary public hosts are
 * all rejected.
 */
function subscribe(body: Record<string, unknown>) {
  return validate(plainToInstance(SubscribePushDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('SubscribePushDto endpoint', () => {
  it('accepts a public https endpoint from a push service', async () => {
    expect(await subscribe({ endpoint: ENDPOINT, keys: KEYS })).toHaveLength(0);
  });

  it.each([
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://updates.push.services.mozilla.com:443/wpush/v2/abc',
    'https://abc123.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGxhbWU',
    'https://wns2-abc.notify.windows.com/w/?token=abc',
  ])('accepts the known service host in %s', async (endpoint) => {
    expect(await subscribe({ endpoint, keys: KEYS })).toHaveLength(0);
  });

  it('rejects a plain-http endpoint even on a public host', async () => {
    expect(
      await subscribe({ endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys: KEYS }),
    ).not.toHaveLength(0);
  });

  it('rejects an arbitrary public host, not just internal addresses', async () => {
    expect(
      await subscribe({ endpoint: 'https://example.com/push', keys: KEYS }),
    ).not.toHaveLength(0);
  });

  it.each([
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://[::1]/push',
    'https://10.0.0.1/push',
    'https://192.168.1.10:8443/push',
    'https://foo.local/push',
    'https://metadata.internal/push',
    'https://0.0.0.0/push',
    // Right service, not the default port.
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    // A look-alike that is a different host entirely.
    'https://fcm.googleapis.com.evil.test/fcm/send/abc',
    'https://notpush.apple.com/push',
  ])('rejects %s as not a push service', async (endpoint) => {
    const errors = await subscribe({ endpoint, keys: KEYS });

    expect(errors.map((error) => error.property)).toContain('endpoint');
  });

  it('rejects a relative or unparseable endpoint', async () => {
    for (const endpoint of ['/fcm/send/abc', 'not a url', '']) {
      expect((await subscribe({ endpoint, keys: KEYS })).length).toBeGreaterThan(0);
    }
  });
});

describe('SubscribePushDto keys', () => {
  it('rejects a body with no keys at all', async () => {
    expect(await subscribe({ endpoint: ENDPOINT })).not.toHaveLength(0);
  });

  it('rejects keys missing one half or carrying non-base64url characters', async () => {
    for (const keys of [
      { p256dh: KEYS.p256dh },
      { auth: KEYS.auth },
      { p256dh: 'not base64 url!', auth: KEYS.auth },
      { p256dh: KEYS.p256dh, auth: 'auth with spaces' },
    ]) {
      expect((await subscribe({ endpoint: ENDPOINT, keys })).length).toBeGreaterThan(0);
    }
  });

  it('rejects unknown fields the way the global pipe does', async () => {
    const errors = await subscribe({
      endpoint: ENDPOINT,
      keys: { ...KEYS, extra: 'nope' },
      userId: '507f1f77bcf86cd799440301',
    });

    const properties = errors.map((error) => error.property);
    // The caller may not choose whose device this is.
    expect(properties).toContain('userId');
    expect(properties).toContain('keys');
  });
});

describe('UnsubscribePushDto', () => {
  it('applies the same endpoint rule to removal', async () => {
    expect(await validate(plainToInstance(UnsubscribePushDto, { endpoint: ENDPOINT }))).toHaveLength(0);
    expect(
      await validate(plainToInstance(UnsubscribePushDto, { endpoint: 'https://127.0.0.1/push' })),
    ).not.toHaveLength(0);
  });
});
