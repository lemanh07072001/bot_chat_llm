import { Controller, Get, Headers, HttpCode, Post, Body } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { PushService } from './push.service.js';
import { SubscribePushDto, UnsubscribePushDto } from './push.dto.js';

/** Long enough to recognise a browser, short enough to store. */
const MAX_USER_AGENT = 300;

/**
 * Web Push enrolment for the signed-in person's current device.
 *
 * Same auth as the bell: the global guard rejects anyone without an agent JWT,
 * and every route acts on `currentUser.sub` only.
 */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** `publicKey: null` means this deployment has no VAPID keys. */
  @Get('public-key')
  publicKey() {
    return { publicKey: this.push.publicKey() };
  }

  @HttpCode(200)
  @Post('subscribe')
  async subscribe(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: SubscribePushDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.push.subscribe(
      currentUser.sub,
      dto,
      userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null,
    );

    return { ok: true as const };
  }

  @HttpCode(200)
  @Post('unsubscribe')
  async unsubscribe(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: UnsubscribePushDto,
  ) {
    await this.push.unsubscribe(currentUser.sub, dto.endpoint);

    return { ok: true as const };
  }
}
