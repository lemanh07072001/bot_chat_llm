import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { UsersService } from '../users/users.service.js';
import {
  AssignTicketDto,
  ListTicketsQuery,
  ReplyTicketDto,
  UpdateTicketDto,
} from './dto/tickets.dto.js';
import { TicketsService } from './tickets.service.js';
import type { TicketActor } from './tickets.types.js';

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListTicketsQuery) {
    return this.tickets.list(await this.actorOf(user), query);
  }

  // Declared before ':id' so "summary" is never read as a ticket id.
  @Get('summary')
  async summary(@CurrentUser() user: JwtPayload) {
    return this.tickets.summary(await this.actorOf(user));
  }

  @Get(':id')
  async get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tickets.get(await this.actorOf(user), id);
  }

  @HttpCode(200)
  @Post(':id/assign')
  async assign(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.tickets.assign(await this.actorOf(user), id, dto.agentId ?? null);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.tickets.setStatus(await this.actorOf(user), id, dto.status);
  }

  @HttpCode(200)
  @Post(':id/replies')
  async reply(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.tickets.reply(
      await this.actorOf(user),
      id,
      dto.body?.trim() ?? '',
      dto.attachmentIds,
    );
  }

  /** The current database role, not a potentially stale JWT claim. */
  private async actorOf(payload: JwtPayload): Promise<TicketActor> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new ForbiddenException();
    }

    return {
      userId: payload.sub,
      isAdmin: user.role === 'admin' && Boolean(user.emailVerified),
      name: user.name,
    };
  }
}
