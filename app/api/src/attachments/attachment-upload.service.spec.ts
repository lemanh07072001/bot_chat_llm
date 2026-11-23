import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Types } from 'mongoose';
import { vi } from 'vitest';
import { AttachmentUploadService, sniffImageType } from './attachment-upload.service.js';

const SITE_ID = '507f1f77bcf86cd799440401';
const VISITOR_ID = '507f1f77bcf86cd799440402';
const CONVERSATION_ID = '507f1f77bcf86cd799440403';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

function harness() {
  const storage = {
    put: vi.fn(async (key: string, _body: Buffer, _type: string) => `https://cdn.example.com/${key}`),
    delete: vi.fn(async (_key: string) => true),
  };
  const uploadModel = {
    create: vi.fn(async (values: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...values })),
  };
  const service = new AttachmentUploadService(uploadModel as never, storage as never);
  return { service, storage, uploadModel };
}

const owner = {
  siteId: SITE_ID,
  ownerKind: 'visitor' as const,
  ownerId: VISITOR_ID,
  conversationId: CONVERSATION_ID,
};

describe('sniffImageType', () => {
  it.each([
    [JPEG, 'image/jpeg'],
    [PNG, 'image/png'],
    [GIF, 'image/gif'],
    [Buffer.from('GIF87a\x01\x00', 'latin1'), 'image/gif'],
    [WEBP, 'image/webp'],
  ])('detects %#', (buffer, type) => {
    expect(sniffImageType(buffer)).toBe(type);
  });

  it('rejects svg and text', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from('hello world, not an image'))).toBeNull();
    expect(sniffImageType(Buffer.from('RIFF\x00\x00\x00\x00WAVE', 'latin1'))).toBeNull();
  });
});

describe('AttachmentUploadService.store', () => {
  it.each([
    [JPEG, 'image/jpeg', 'jpg'],
    [PNG, 'image/png', 'png'],
    [GIF, 'image/gif', 'gif'],
    [WEBP, 'image/webp', 'webp'],
  ])('stores %# under attachments/<siteId>/<uuid>.<ext>', async (buffer, mimeType, ext) => {
    const h = harness();

    const view = await h.service.store({ ...owner, buffer, width: '640', height: 480, name: '  photo.png ' });

    const [key, body, type] = h.storage.put.mock.calls[0];
    expect(key).toMatch(new RegExp(`^attachments/${SITE_ID}/[0-9a-f-]{36}\\.${ext}$`));
    expect(body).toBe(buffer);
    expect(type).toBe(mimeType);
    expect(view).toMatchObject({
      url: `https://cdn.example.com/${key}`,
      mimeType,
      size: buffer.length,
      width: 640,
      height: 480,
      name: 'photo.png',
    });
    expect(h.uploadModel.create.mock.calls[0][0]).toMatchObject({
      key,
      ownerKind: 'visitor',
      usedAt: null,
    });
    expect(String(h.uploadModel.create.mock.calls[0][0].conversationId)).toBe(CONVERSATION_ID);
  });

  it('ignores the declared type: svg/text disguised as png is rejected', async () => {
    const h = harness();

    await expect(
      h.service.store({ ...owner, buffer: Buffer.from('<svg onload="alert(1)"></svg>'), name: 'x.png' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.service.store({ ...owner, buffer: Buffer.from('just text') })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.storage.put).not.toHaveBeenCalled();
  });

  it('rejects files over 10MB and empty files', async () => {
    const h = harness();
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);

    await expect(h.service.store({ ...owner, buffer: big })).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(h.service.store({ ...owner, buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.storage.put).not.toHaveBeenCalled();
  });

  it('nulls out-of-range dimensions and blank names', async () => {
    const h = harness();

    const view = await h.service.store({ ...owner, buffer: PNG, width: '0', height: '20001', name: '   ' });

    expect(view).toMatchObject({ width: null, height: null, name: null });
  });

  it('truncates long names to 200 characters', async () => {
    const h = harness();

    const view = await h.service.store({ ...owner, buffer: PNG, name: 'a'.repeat(300) });

    expect(view.name).toHaveLength(200);
  });

  it('deletes the stored object when the upload row cannot be written', async () => {
    const h = harness();
    h.uploadModel.create.mockRejectedValueOnce(new Error('mongo down'));

    await expect(h.service.store({ ...owner, buffer: PNG })).rejects.toThrow('mongo down');

    const [key] = h.storage.put.mock.calls[0];
    expect(h.storage.delete).toHaveBeenCalledWith(key);
  });
});
