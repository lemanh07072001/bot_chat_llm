import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), client: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { constructor(config: unknown) { mocks.client(config); } send = mocks.send; destroy = mocks.destroy; },
  PutObjectCommand: class { constructor(public input: unknown) {} },
}));
import { R2ImageService } from './r2-image.service.js';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
const config = { R2_ACCOUNT_ID: '0'.repeat(32), R2_ACCESS_KEY_ID: 'test-access', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET: 'test-bucket', R2_PUBLIC_BASE_URL: 'https://images.example.test/assets' };
function service(values = config) { return new R2ImageService(new ConfigService(values)); }
beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({}); });
describe('R2ImageService', () => {
  it('uploads only raster bytes to an owner-prefixed unique key and returns the public URL', async () => {
    const result = await service().upload(png, 'test-owner');
    expect(result.url).toMatch(/^https:\/\/images.example.test\/assets\/site-images\/test-owner\/[a-f0-9-]+\.png$/);
    const command = mocks.send.mock.calls[0][0].input;
    expect(command.Bucket).toBe('test-bucket');
    expect(command.ContentType).toBe('image/png');
    expect(Buffer.isBuffer(command.Body)).toBe(true);
    expect(mocks.client.mock.calls[0][0].endpoint).toBe('https://' + '0'.repeat(32) + '.r2.cloudflarestorage.com');
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(Object.keys(result)).toEqual(['url']);
  });
  it('rejects forged MIME and oversized data before any remote write', async () => {
    for (const data of ['data:image/png;base64,aGVsbG8=', 'data:image/svg+xml;base64,PHN2Zz4=', png + 'A'.repeat(50000)]) {
      await expect(service().upload(data, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('fails closed on missing config and insecure public URL', async () => {
    await expect(service({ ...config, R2_BUCKET: '' }).upload(png, 'owner')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service({ ...config, R2_PUBLIC_BASE_URL: 'http://images.example.test' }).upload(png, 'owner')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not leak SDK errors and closes the client on failure', async () => {
    mocks.send.mockRejectedValue(new Error('sensitive upstream error'));
    await expect(service().upload(png, 'owner')).rejects.not.toThrow('sensitive upstream error');
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
