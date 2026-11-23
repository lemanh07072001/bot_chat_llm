import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { Public } from '../auth/public.decorator.js';
import { SitesService } from '../sites/sites.service.js';
import { UploadAdmissionInterceptor } from './upload-admission.interceptor.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { AttachmentUploadService } from './attachment-upload.service.js';
import {
  AttachmentFileInterceptor,
  type UploadedImageFile,
} from './attachment-file.interceptor.js';
import type { AttachmentView } from './attachment.types.js';

/** Optional multipart fields next to `file`; validated leniently by the service. */
export class UploadImageFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  width?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  height?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  name?: string;
}

export class StaffUploadImageDto extends UploadImageFieldsDto {
  @IsMongoId()
  siteId!: string;
}

/**
 * Display name: the client's `name` field wins. Multer decodes the multipart
 * filename as latin1, so a UTF-8 name ("ảnh.png") arrives mangled; re-decode it.
 */
export function uploadName(name: string | undefined, file: UploadedImageFile): string | undefined {
  if (name) return name;
  if (!file.originalname) return undefined;
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

export function requireFile(file: UploadedImageFile | undefined): UploadedImageFile {
  if (!file?.buffer) throw new BadRequestException('Thiếu tệp ảnh.');
  return file;
}

@Controller()
export class UploadsController {
  constructor(
    private readonly uploads: AttachmentUploadService,
    private readonly storage: AttachmentStorageService,
    private readonly sites: SitesService,
  ) {}

  /** Staff upload for ticket replies and inbox messages of one site. */
  @HttpCode(200)
  @Post('uploads')
  // Admission (rate limit, in-flight cap) runs before multer buffers the file.
  @UseInterceptors(UploadAdmissionInterceptor, AttachmentFileInterceptor)
  async upload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StaffUploadImageDto,
    @UploadedFile() file?: UploadedImageFile,
  ): Promise<AttachmentView> {
    if ((await this.sites.accessFor(dto.siteId, user.sub)) === 'none') {
      throw new ForbiddenException();
    }

    const image = requireFile(file);

    return this.uploads.store({
      buffer: image.buffer,
      name: uploadName(dto.name, image),
      width: dto.width,
      height: dto.height,
      siteId: dto.siteId,
      ownerKind: 'agent',
      ownerId: user.sub,
    });
  }

  /** Local-storage fallback only; R2 objects are served by R2 itself. */
  @Public()
  @Get('attachments/:file')
  async file(@Param('file') filename: string, @Res() response: Response) {
    const image = await this.storage.load(filename);
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.send(image.body);
  }
}
