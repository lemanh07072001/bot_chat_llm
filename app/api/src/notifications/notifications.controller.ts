import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { NotificationsService } from './notifications.service.js';
import { ListNotificationsQuery } from './notifications.dto.js';

/** The bell. Every route is scoped to the caller; there is no id in the path
 * that could name somebody else's row. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListNotificationsQuery,
  ) {
    return this.notifications.listForUser(currentUser.sub, {
      limit: query.limit,
      before: query.before,
    });
  }

  @HttpCode(200)
  @Post('read-all')
  async readAll(@CurrentUser() currentUser: JwtPayload) {
    const { unreadCount } = await this.notifications.markAllRead(currentUser.sub);
    return { ok: true as const, unreadCount };
  }

  @HttpCode(200)
  @Post(':id/read')
  async read(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
  ) {
    const result = await this.notifications.markRead(currentUser.sub, id);

    // Same response for "not yours" and "does not exist", so the id space
    // cannot be probed for other people's notifications.
    if (!result) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    return { ok: true as const, unreadCount: result.unreadCount };
  }
}
