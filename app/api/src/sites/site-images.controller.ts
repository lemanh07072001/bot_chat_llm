import { Body, Controller, ForbiddenException, Get, HttpException, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { IsString, MaxLength, Matches } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { UsersService } from '../users/users.service.js';
import { RateLimiterService } from '../realtime/rate-limiter.service.js';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { LocalImageService } from './local-image.service.js';
export class UploadSiteImageDto {
  @IsString()
  @MaxLength(50000)
  @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  dataUrl!: string;
}
@Controller('site-images')
export class SiteImagesController {
  constructor(private readonly users: UsersService, private readonly limiter: RateLimiterService, private readonly localImages: LocalImageService) {}
  @Public()
  @Get(':filename')
  async image(@Param('filename') filename: string, @Res() response: Response) {
    const image = await this.localImages.load(filename);
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.send(image.body);
  }

  @Post()
  async upload(@CurrentUser() actor: JwtPayload, @Body() dto: UploadSiteImageDto) {
    const user = await this.users.findById(actor.sub);
    if (!user || user.role !== 'admin' || !user.emailVerified) throw new ForbiddenException();
    if (!this.limiter.consume('site-image:' + actor.sub, 10, 60_000)) throw new HttpException('Bạn tải ảnh quá nhanh. Hãy thử lại sau một phút.', HttpStatus.TOO_MANY_REQUESTS);
    return this.localImages.upload(dto.dataUrl);
  }
}
