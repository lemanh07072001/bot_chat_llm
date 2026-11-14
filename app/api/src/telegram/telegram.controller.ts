import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { SaveTelegramDto } from './telegram.dto.js';
import { TelegramService } from './telegram.service.js';

@Controller('sites/:siteId/telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}
  @Get()
  async view(@CurrentUser() user: JwtPayload, @Param('siteId') siteId: string) {
    await this.telegram.assertOwner(siteId, user.sub);
    return this.telegram.view(siteId);
  }
  @Put()
  async save(@CurrentUser() user: JwtPayload, @Param('siteId') siteId: string, @Body() dto: SaveTelegramDto) {
    await this.telegram.assertOwner(siteId, user.sub);
    return this.telegram.save(siteId, dto);
  }
  @Post('test')
  async test(@CurrentUser() user: JwtPayload, @Param('siteId') siteId: string) {
    await this.telegram.assertOwner(siteId, user.sub);
    return this.telegram.test(siteId);
  }
}
