import { BadRequestException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Subject, lastValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { RateLimiterService } from '../realtime/rate-limiter.service.js';
import {
  MAX_UPLOADS_IN_FLIGHT,
  SITE_MAINTENANCE_MESSAGE,
  UPLOAD_BUSY_MESSAGE,
  UploadAdmissionInterceptor,
  WIDGET_UPLOAD_IP_LIMIT,
  WIDGET_UPLOAD_LIMIT,
} from './upload-admission.interceptor.js';
import {
  BAD_MULTIPART_MESSAGE,
  ONE_FILE_MESSAGE,
  mapMulterError,
} from './attachment-file.interceptor.js';
import { uploadName } from './uploads.controller.js';

const SITE_ID = '507f1f77bcf86cd799440401';

function context(request: Record<string, unknown>, response = new EventEmitter()) {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as never;
}

function harness(active = true) {
  const limiter = new RateLimiterService();
  const sites = { findById: vi.fn(async () => ({ active })) };
  const interceptor = new UploadAdmissionInterceptor(limiter, sites as never);
  return { interceptor, limiter, sites };
}

const visitor = (sub: string) => ({ sub, siteId: SITE_ID, conversationId: SITE_ID });
const handler = { handle: () => of('ok') };

async function status(promise: Promise<unknown>): Promise<number | 'ok'> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as HttpException).getStatus();
  }
}

describe('UploadAdmissionInterceptor', () => {
  it('rate-limits a visitor before the file is read', async () => {
    const { interceptor } = harness();
    const request = { visitor: visitor('v1'), ip: '1.1.1.1' };
    for (let i = 0; i < WIDGET_UPLOAD_LIMIT; i++) {
      await lastValueFrom(await interceptor.intercept(context(request), handler));
    }
    await expect(status(interceptor.intercept(context(request), handler))).resolves.toBe(429);
  });

  it('rate-limits one IP across visitors', async () => {
    const { interceptor } = harness();
    let n = 0;
    for (let i = 0; i < WIDGET_UPLOAD_IP_LIMIT; i++) {
      await lastValueFrom(
        await interceptor.intercept(context({ visitor: visitor('v' + n++), ip: '2.2.2.2' }), handler),
      );
    }
    await expect(
      status(interceptor.intercept(context({ visitor: visitor('fresh'), ip: '2.2.2.2' }), handler)),
    ).resolves.toBe(429);
  });

  it('rejects uploads for a site in maintenance', async () => {
    const { interceptor } = harness(false);
    await expect(
      interceptor.intercept(context({ visitor: visitor('v'), ip: '3.3.3.3' }), handler),
    ).rejects.toMatchObject({ status: 503, message: SITE_MAINTENANCE_MESSAGE });
  });

  it('rate-limits staff per user', async () => {
    const { interceptor } = harness();
    const request = { user: { sub: 'u1' } };
    for (let i = 0; i < 60; i++) {
      await lastValueFrom(await interceptor.intercept(context(request), handler));
    }
    await expect(status(interceptor.intercept(context(request), handler))).resolves.toBe(429);
  });

  it('caps uploads in flight and always releases the slot', async () => {
    const { interceptor } = harness();
    const pending: Array<Subject<string>> = [];
    const subs = [];
    for (let i = 0; i < MAX_UPLOADS_IN_FLIGHT; i++) {
      const subject = new Subject<string>();
      pending.push(subject);
      const observable = await interceptor.intercept(context({ user: { sub: 'u' + i } }), {
        handle: () => subject,
      });
      subs.push(observable.subscribe({ error: () => undefined }));
    }
    expect(interceptor.active).toBe(MAX_UPLOADS_IN_FLIGHT);

    await expect(interceptor.intercept(context({ user: { sub: 'x' } }), handler)).rejects.toMatchObject({
      status: 503,
      message: UPLOAD_BUSY_MESSAGE,
    });

    pending[0].complete();
    pending[1].error(new Error('boom'));
    expect(interceptor.active).toBe(MAX_UPLOADS_IN_FLIGHT - 2);
    pending.slice(2).forEach((subject) => subject.complete());
    expect(interceptor.active).toBe(0);
  });

  it('releases the slot when the client goes away', async () => {
    const { interceptor } = harness();
    const response = new EventEmitter();
    await interceptor.intercept(context({ user: { sub: 'u' } }, response), { handle: () => new Subject() });
    expect(interceptor.active).toBe(1);
    response.emit('close');
    expect(interceptor.active).toBe(0);
  });
});

describe('mapMulterError', () => {
  it('maps by multer code', () => {
    expect(mapMulterError(new PayloadTooLargeException('File too large'))).toMatchObject({
      status: 413,
      message: 'Ảnh vượt quá 10MB.',
    });
    expect(mapMulterError(new BadRequestException('Unexpected file field - photo'))).toMatchObject({
      status: 400,
      message: ONE_FILE_MESSAGE,
    });
    expect(mapMulterError(new BadRequestException('Too many files'))?.message).toBe(ONE_FILE_MESSAGE);
    expect(mapMulterError(new BadRequestException('Too many parts'))?.message).toBe(BAD_MULTIPART_MESSAGE);
    expect(mapMulterError(new BadRequestException('Field value too long - name'))?.message).toBe(
      BAD_MULTIPART_MESSAGE,
    );
    expect(mapMulterError(new Error('other'))).toBeNull();
  });
});

describe('uploadName', () => {
  const file = (originalname: string) => ({ originalname, buffer: Buffer.alloc(1), size: 1, mimetype: '' });

  it('prefers the client name field', () => {
    expect(uploadName('ảnh.png', file('x.png'))).toBe('ảnh.png');
  });

  it('re-decodes the multipart filename as UTF-8', () => {
    const mangled = Buffer.from('ảnh.png', 'utf8').toString('latin1');
    expect(uploadName(undefined, file(mangled))).toBe('ảnh.png');
  });
});
