import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const NAME = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;
@Injectable()
export class LocalImageService {
  constructor(private readonly config: ConfigService) {}
  private directory() { return resolve(this.config.get<string>('SITE_IMAGE_DIR') || 'uploads/site-images'); }

  async upload(dataUrl: string): Promise<{ url: string }> {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || dataUrl.length > 50000) throw new BadRequestException('Invalid image');
    const body = Buffer.from(match[2], 'base64');
    if (!body.length || body.toString('base64') !== match[2]) throw new BadRequestException('Invalid image encoding');
    const type = match[1];
    const valid = type === 'png' ? body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : type === 'jpeg' ? body[0] === 255 && body[1] === 216 && body[2] === 255
      : body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new BadRequestException('Image contents do not match the declared format');
    let base: URL;
    try {
      const configured = this.config.get<string>('PUBLIC_API_URL') || 'http://localhost:3002/api';
      base = new URL(configured.replace(/\/+$/, '') + '/');
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    } catch { throw new ServiceUnavailableException('PUBLIC_API_URL is invalid'); }
    const filename = randomUUID() + '.' + (type === 'jpeg' ? 'jpg' : type);
    try {
      await mkdir(this.directory(), { recursive: true });
      await writeFile(join(this.directory(), filename), body, { flag: 'wx' });
    } catch { throw new ServiceUnavailableException('Không lưu được ảnh. Kiểm tra quyền ghi thư mục uploads.'); }
    return { url: new URL('site-images/' + filename, base).toString() };
  }

  async load(filename: string): Promise<{ body: Buffer; contentType: string }> {
    if (!NAME.test(filename)) throw new NotFoundException();
    try {
      const body = await readFile(join(this.directory(), filename));
      const extension = filename.split('.').pop();
      return { body, contentType: extension === 'jpg' ? 'image/jpeg' : 'image/' + extension };
    } catch { throw new NotFoundException(); }
  }
}
