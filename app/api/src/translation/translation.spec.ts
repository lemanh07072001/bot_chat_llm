import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationService } from './translation.service.js';

function serviceWith(env: Record<string, string>): TranslationService {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;

  return new TranslationService(config);
}

function completion(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TranslationService', () => {
  const enabled = {
    TRANSLATE_BASE_URL: 'https://translator.example/v1',
    TRANSLATE_API_KEY: 'sk-test',
    TRANSLATE_MODEL: 'tiny-model',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports itself off when no base url is configured', () => {
    const service = serviceWith({});

    expect(service.isEnabled()).toBe(false);
    expect(service.status()).toMatchObject({ enabled: false, model: null });
  });

  it('refuses to translate while off, with a code the panel can act on', async () => {
    const service = serviceWith({});

    await expect(
      service.translate({ text: 'Hello', target: 'vi' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('skips the model when the text is already in the target language', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = serviceWith(enabled);
    const result = await service.translate({
      text: 'Xin chào, đơn hàng của tôi đâu?',
      target: 'vi',
    });

    expect(result.same).toBe(true);
    expect(result.text).toBe('Xin chào, đơn hàng của tôi đâu?');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the configured endpoint and returns the translation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('Xin chào'));
    vi.stubGlobal('fetch', fetchMock);

    const service = serviceWith(enabled);
    const result = await service.translate({ text: 'Hello', target: 'vi' });

    expect(result).toMatchObject({ text: 'Xin chào', source: 'en', target: 'vi', same: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://translator.example/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');

    const body = JSON.parse(String(init.body)) as { model: string; messages: unknown[] };
    expect(body.model).toBe('tiny-model');
    expect(body.messages).toHaveLength(2);
  });

  it('serves a repeat from cache instead of paying twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('Xin chào'));
    vi.stubGlobal('fetch', fetchMock);

    const service = serviceWith(enabled);

    await service.translate({ text: 'Hello', target: 'vi' });
    const second = await service.translate({ text: 'Hello', target: 'vi' });

    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('unwraps quotes a model adds anyway', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion('"Xin chào"')));

    const service = serviceWith(enabled);
    const result = await service.translate({ text: 'Hello', target: 'vi' });

    expect(result.text).toBe('Xin chào');
  });

  it('rejects an empty answer rather than storing nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion('   ')));

    const service = serviceWith(enabled);

    await expect(service.translate({ text: 'Hello', target: 'vi' })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('turns a provider rejection into an actionable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    );

    const service = serviceWith(enabled);

    await expect(service.translate({ text: 'Hello', target: 'vi' })).rejects.toMatchObject({
      response: { code: 'TRANSLATE_FAILED' },
    });
  });

  it('refuses empty input before calling anybody', async () => {
    const service = serviceWith(enabled);

    await expect(service.translate({ text: '  ', target: 'vi' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
