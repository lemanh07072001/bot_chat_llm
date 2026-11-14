import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalImageService } from './local-image.service.js';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
describe('LocalImageService', () => {
  let directory: string;
  let service: LocalImageService;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'chat-logo-'));
    service = new LocalImageService(new ConfigService({ SITE_IMAGE_DIR: directory, PUBLIC_API_URL: 'http://localhost:3002/api' }));
  });
  afterEach(async () => {
    for (const name of await readdir(directory)) await unlink(join(directory, name));
    await rmdir(directory);
  });
  it('persists raster bytes and reloads through a unique public path', async () => {
    const one = await service.upload(png);
    const two = await service.upload(png);
    expect(one.url).not.toBe(two.url);
    expect(one.url).toMatch(/^http:\/\/localhost:3002\/api\/site-images\/[a-f0-9-]{36}\.png$/);
    const loaded = await service.load(new URL(one.url).pathname.split('/').pop()!);
    expect(loaded.contentType).toBe('image/png');
    expect(loaded.body).toEqual(Buffer.from(png.split(',')[1], 'base64'));
  });
  it('rejects mismatched raster headers without writing files', async () => {
    await expect(service.upload('data:image/png;base64,aGVsbG8=')).rejects.toBeInstanceOf(BadRequestException);
    expect(await readdir(directory)).toEqual([]);
  });
  it('does not expose arbitrary files or accept traversal', async () => {
    for (const name of ['../.env', 'logo.svg', '/etc/passwd', '00000000-0000-0000-0000-000000000000.png']) {
      await expect(service.load(name)).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});
