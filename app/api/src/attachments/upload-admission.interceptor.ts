import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { finalize, type Observable } from 'rxjs';
import type { JwtPayload, VisitorJwtPayload } from '../auth/jwt-payload.type.js';
import { RateLimiterService } from '../realtime/rate-limiter.service.js';
import { SitesService } from '../sites/sites.service.js';

export const UPLOAD_WINDOW_MS = 600_000;
/** Up to 5 images per message; this still allows a few busy messages. */
export const WIDGET_UPLOAD_LIMIT = 20;
/** Several visitors behind one NAT address share this. */
export const WIDGET_UPLOAD_IP_LIMIT = 60;
export const STAFF_UPLOAD_LIMIT = 60;
/** Each upload may hold up to 10 MB in memory; this bounds the total. */
export const MAX_UPLOADS_IN_FLIGHT = 8;

export const UPLOAD_BUSY_MESSAGE = 'Máy chủ đang bận, thử lại sau.';
export const SITE_MAINTENANCE_MESSAGE = 'Hệ thống chat đang bảo trì. Vui lòng quay lại sau.';

interface UploadRequest {
  ip?: string;
  visitor?: VisitorJwtPayload;
  user?: JwtPayload;
}

interface ClosableResponse {
  once?(event: 'close', listener: () => void): unknown;
}

function tooMany(message: string): HttpException {
  return new HttpException(
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, message },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Admission for upload endpoints. Must be listed BEFORE AttachmentFileInterceptor
 * so a rejected request is turned away before multer buffers up to 10 MB.
 * Runs after the guards, so `request.visitor` (VisitorGuard) or `request.user`
 * (the global JWT guard) is already set and decides which limits apply.
 */
@Injectable()
export class UploadAdmissionInterceptor implements NestInterceptor {
  private inFlight = 0;

  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly sites: SitesService,
  ) {}

  /** Exposed for tests. */
  get active(): number {
    return this.inFlight;
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<UploadRequest>();
    const response = http.getResponse<ClosableResponse>();

    if (request.visitor) {
      await this.admitVisitor(request.visitor, request.ip);
    } else if (request.user?.sub) {
      if (!this.rateLimiter.consume('upload:' + request.user.sub, STAFF_UPLOAD_LIMIT, UPLOAD_WINDOW_MS)) {
        throw tooMany('Bạn tải ảnh quá nhanh. Hãy thử lại sau ít phút.');
      }
    } else {
      throw new UnauthorizedException();
    }

    if (this.inFlight >= MAX_UPLOADS_IN_FLIGHT) {
      throw new ServiceUnavailableException(UPLOAD_BUSY_MESSAGE);
    }

    this.inFlight++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.inFlight--;
    };

    // `close` also covers a client that aborts mid-upload.
    response?.once?.('close', release);

    try {
      return next.handle().pipe(finalize(release));
    } catch (error) {
      release();
      throw error;
    }
  }

  private async admitVisitor(visitor: VisitorJwtPayload, ip: string | undefined): Promise<void> {
    const site = await this.sites.findById(visitor.siteId);

    if (!site || !site.active) {
      throw new ServiceUnavailableException(SITE_MAINTENANCE_MESSAGE);
    }

    if (!this.rateLimiter.consume('widget-upload:' + visitor.sub, WIDGET_UPLOAD_LIMIT, UPLOAD_WINDOW_MS)) {
      throw tooMany('Bạn gửi ảnh quá nhanh. Hãy thử lại sau ít phút.');
    }

    if (
      ip &&
      !this.rateLimiter.consume('widget-upload-ip:' + ip, WIDGET_UPLOAD_IP_LIMIT, UPLOAD_WINDOW_MS)
    ) {
      throw tooMany('Bạn gửi ảnh quá nhanh. Hãy thử lại sau ít phút.');
    }
  }
}
