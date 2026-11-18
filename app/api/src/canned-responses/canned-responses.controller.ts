import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import {
  UpdateCannedSetDto,
  UpdateSiteCannedSetDto,
} from './canned-responses.dto.js';
import { CannedResponsesService } from './canned-responses.service.js';

@Controller()
export class CannedResponsesController {
  constructor(private readonly canned: CannedResponsesService) {}

  /** Readable by any signed-in member: they all paste these into replies. */
  @Get('canned-responses/global')
  async viewGlobal() {
    return this.canned.getGlobal();
  }

  @Put('canned-responses/global')
  async saveGlobal(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCannedSetDto,
  ) {
    return this.canned.updateGlobal(user.sub, dto);
  }

  /**
   * What the composer shows for one conversation: the project's mode plus both
   * sets. `siteId` is a query parameter rather than a nested route so the
   * admin panel can call it without knowing the project path.
   */
  @Get('canned-responses/effective')
  async effective(
    @CurrentUser() user: JwtPayload,
    @Query('siteId') siteId?: string,
  ) {
    if (!siteId) {
      throw new BadRequestException('Thiếu siteId.');
    }

    return this.canned.effective(siteId, user.sub);
  }

  @Get('sites/:siteId/canned-responses')
  async viewSite(
    @CurrentUser() user: JwtPayload,
    @Param('siteId') siteId: string,
  ) {
    return this.canned.getSite(siteId, user.sub);
  }

  /** Owner-only, matching every other project configuration write. */
  @Put('sites/:siteId/canned-responses')
  async saveSite(
    @CurrentUser() user: JwtPayload,
    @Param('siteId') siteId: string,
    @Body() dto: UpdateSiteCannedSetDto,
  ) {
    return this.canned.updateSite(siteId, user.sub, dto);
  }
}
