import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { MAX_ATTACHMENT_BYTES } from './attachment.types.js';
import { ATTACHMENT_TOO_LARGE_MESSAGE } from './attachment-upload.service.js';

/** The multipart file as multer's memory storage hands it over. */
export interface UploadedImageFile {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
}

/** No `storage`/`dest`: multer keeps the file in memory. */
const MulterInterceptor = FileInterceptor('file', {
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 10, fieldSize: 4096, parts: 12 },
});

export const ONE_FILE_MESSAGE = 'Mỗi lần chỉ gửi một ảnh, trường "file".';
export const BAD_MULTIPART_MESSAGE = 'Dữ liệu tải lên không hợp lệ.';

/**
 * Nest turns multer's error into an HttpException carrying only multer's
 * message (`<message>` or `<message> - <field>`), so the code is recovered
 * from multer's fixed message table.
 */
const MULTER_MESSAGES: Array<[code: string, message: string]> = [
  ['LIMIT_PART_COUNT', 'Too many parts'],
  ['LIMIT_FILE_SIZE', 'File too large'],
  ['LIMIT_FILE_COUNT', 'Too many files'],
  ['LIMIT_FIELD_KEY', 'Field name too long'],
  ['LIMIT_FIELD_VALUE', 'Field value too long'],
  ['LIMIT_FIELD_COUNT', 'Too many fields'],
  ['LIMIT_UNEXPECTED_FILE', 'Unexpected file field'],
  ['LIMIT_UNEXPECTED_FILE', 'Unexpected field'],
  ['MISSING_FIELD_NAME', 'Field name missing'],
  ['LIMIT_FIELD_NESTING', 'Field name nesting too deep'],
  ['LIMIT_FIELD_ARRAY_INDEX', 'Field name array index too large'],
];

function multerCode(error: unknown): string | null {
  const raw = error as { code?: unknown } | null;
  if (raw && typeof raw.code === 'string' && raw.code.startsWith('LIMIT_')) return raw.code;
  if (!(error instanceof HttpException)) return null;

  const response = error.getResponse();
  const message =
    typeof response === 'string'
      ? response
      : typeof (response as { message?: unknown })?.message === 'string'
        ? (response as { message: string }).message
        : error.message;

  const hit = MULTER_MESSAGES.find(([, text]) => message === text || message.startsWith(text + ' - '));
  return hit ? hit[0] : null;
}

/** Maps a multer failure to a message people can read; null when not multer's. */
export function mapMulterError(error: unknown): HttpException | null {
  const code = multerCode(error);

  if (code === 'LIMIT_FILE_SIZE' || error instanceof PayloadTooLargeException) {
    return new PayloadTooLargeException(ATTACHMENT_TOO_LARGE_MESSAGE);
  }
  if (code === 'LIMIT_UNEXPECTED_FILE' || code === 'LIMIT_FILE_COUNT') {
    return new BadRequestException(ONE_FILE_MESSAGE);
  }
  if (code || error instanceof BadRequestException) {
    // LIMIT_FIELD_*, LIMIT_PART_COUNT, malformed multipart bodies.
    return new BadRequestException(BAD_MULTIPART_MESSAGE);
  }
  return null;
}

/**
 * Multipart field `file`, at most one and at most 10 MB. Wraps Nest's
 * FileInterceptor only to give its errors messages people can read.
 * List UploadAdmissionInterceptor before this one.
 */
@Injectable()
export class AttachmentFileInterceptor implements NestInterceptor {
  private readonly inner = new MulterInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return (await this.inner.intercept(context, next)) as Observable<unknown>;
    } catch (error) {
      throw mapMulterError(error) ?? error;
    }
  }
}
