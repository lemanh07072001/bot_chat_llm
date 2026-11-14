import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class R2ImageService {
  constructor(private readonly config: ConfigService) {}

  async upload(dataUrl: string, userId: string): Promise<{ url: string }> {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || dataUrl.length > 50000) throw new BadRequestException('Invalid logo image');
    const body = Buffer.from(match[2], 'base64');
    if (!body.length || body.toString('base64') !== match[2]) throw new BadRequestException('Invalid image encoding');
    const type = match[1];
    const valid = type === 'png' ? body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : type === 'jpeg' ? body[0] === 255 && body[1] === 216 && body[2] === 255
      : body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new BadRequestException('Image contents do not match the declared format');
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('R2_BUCKET');
    const publicBase = this.config.get<string>('R2_PUBLIC_BASE_URL');
    if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      throw new ServiceUnavailableException('Cloudflare R2 chưa được cấu hình trên máy chủ.');
    }
    let publicUrl: URL;
    try {
      publicUrl = new URL(publicBase.endsWith('/') ? publicBase : publicBase + '/');
      if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) throw new Error();
    } catch { throw new ServiceUnavailableException('R2_PUBLIC_BASE_URL phải là URL HTTPS công khai.'); }
    const key = 'site-images/' + userId + '/' + randomUUID() + '.' + (type === 'jpeg' ? 'jpg' : type);
    const client = new S3Client({ region: 'auto', endpoint: 'https://' + accountId + '.r2.cloudflarestorage.com',
      credentials: { accessKeyId, secretAccessKey }, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 }, maxAttempts: 2 });
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'image/' + type, CacheControl: 'public, max-age=31536000, immutable' }));
    } catch { throw new ServiceUnavailableException('Không tải được ảnh lên R2. Kiểm tra cấu hình bucket và quyền API.'); }
    finally { client.destroy(); }
    return { url: new URL(key, publicUrl).toString() };
  }
}
