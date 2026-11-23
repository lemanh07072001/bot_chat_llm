import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Local fallback filenames: `<uuid>.<ext>`, nothing else is ever served. */
export const LOCAL_ATTACHMENT_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
}

/**
 * Public image storage: Cloudflare R2 when every R2 key is configured,
 * otherwise a local directory served by GET /api/attachments/:file.
 * API only — the realtime service never stores files.
 */
@Injectable()
export class AttachmentStorageService {
  constructor(private readonly config: ConfigService) {}

  private r2Config(): R2Config | null {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('R2_BUCKET');
    const publicBase = this.config.get<string>('R2_PUBLIC_BASE_URL');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      return null;
    }

    return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
  }

  private directory(): string {
    return resolve(this.config.get<string>('ATTACHMENT_DIR') || 'uploads/attachments');
  }

  /** Stores the object under `key` and returns its public URL. */
  async put(key: string, body: Buffer, mimeType: string): Promise<string> {
    const r2 = this.r2Config();

    return r2 ? this.putR2(r2, key, body, mimeType) : this.putLocal(key, body);
  }

  private async putR2(r2: R2Config, key: string, body: Buffer, mimeType: string): Promise<string> {
    if (!/^[a-f0-9]{32}$/i.test(r2.accountId)) {
      throw new ServiceUnavailableException('Cloudflare R2 chưa được cấu hình đúng trên máy chủ.');
    }

    let publicUrl: URL;
    try {
      publicUrl = new URL(r2.publicBase.endsWith('/') ? r2.publicBase : r2.publicBase + '/');
      if (
        publicUrl.protocol !== 'https:' ||
        publicUrl.username ||
        publicUrl.password ||
        publicUrl.search ||
        publicUrl.hash
      ) {
        throw new Error();
      }
    } catch {
      throw new ServiceUnavailableException('R2_PUBLIC_BASE_URL phải là URL HTTPS công khai.');
    }

    const client = new S3Client({
      region: 'auto',
      endpoint: 'https://' + r2.accountId + '.r2.cloudflarestorage.com',
      credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
      maxAttempts: 2,
    });

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Không tải được ảnh lên R2. Kiểm tra cấu hình bucket và quyền API.',
      );
    } finally {
      client.destroy();
    }

    return new URL(key, publicUrl).toString();
  }

  private async putLocal(key: string, body: Buffer): Promise<string> {
    const filename = basename(key);

    if (!LOCAL_ATTACHMENT_FILE.test(filename)) {
      throw new ServiceUnavailableException('Tên tệp ảnh không hợp lệ.');
    }

    let base: URL;
    try {
      const configured = this.config.get<string>('PUBLIC_API_URL') || 'http://localhost:3002/api';
      base = new URL(configured.replace(/\/+$/, '') + '/');
      if (
        !['http:', 'https:'].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
      ) {
        throw new Error();
      }
    } catch {
      throw new ServiceUnavailableException('PUBLIC_API_URL is invalid');
    }

    try {
      await mkdir(this.directory(), { recursive: true });
      await writeFile(join(this.directory(), filename), body, { flag: 'wx' });
    } catch {
      throw new ServiceUnavailableException(
        'Không lưu được ảnh. Kiểm tra quyền ghi thư mục uploads.',
      );
    }

    return new URL('attachments/' + filename, base).toString();
  }

  /**
   * Removes the object under `key`. Best effort: never throws, returns false
   * when the delete failed (an already-missing object counts as deleted).
   */
  async delete(key: string): Promise<boolean> {
    const r2 = this.r2Config();

    if (r2) {
      const client = new S3Client({
        region: 'auto',
        endpoint: 'https://' + r2.accountId + '.r2.cloudflarestorage.com',
        credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
        requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
        maxAttempts: 2,
      });

      try {
        await client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
        return true;
      } catch {
        return false;
      } finally {
        client.destroy();
      }
    }

    const filename = basename(key);
    if (!LOCAL_ATTACHMENT_FILE.test(filename)) return false;

    try {
      await unlink(join(this.directory(), filename));
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
    }
  }

  /** Reads a local-fallback file; 404 for anything that is not one. */
  async load(filename: string): Promise<{ body: Buffer; contentType: string }> {
    const match = LOCAL_ATTACHMENT_FILE.exec(filename);

    if (!match) throw new NotFoundException();

    try {
      const body = await readFile(join(this.directory(), filename));
      return { body, contentType: CONTENT_TYPES[match[1]] };
    } catch {
      throw new NotFoundException();
    }
  }
}
