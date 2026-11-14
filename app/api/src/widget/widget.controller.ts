import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Ip,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WidgetService } from './widget.service.js';
import type { WidgetSessionResult } from './widget.service.js';
import { ChatService } from '../chat/chat.service.js';
import { CreateWidgetSessionDto } from './dto/create-widget-session.dto.js';
import { CurrentVisitor, VisitorGuard } from './visitor.guard.js';
import { RateLimiterService } from '../realtime/rate-limiter.service.js';
import { Public } from '../auth/public.decorator.js';
import type { VisitorJwtPayload } from '../auth/jwt-payload.type.js';

export class VisitorContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email không hợp lệ' })
  @MaxLength(200)
  email?: string;
}

export class ListVisitorMessagesQuery {
  /** `createdAt` of the oldest message the widget already holds. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Creating a session writes a visitor and a conversation row, and the endpoint
 * is open by design, so one address cannot be allowed to mint them endlessly.
 * Generous enough for an office behind a single NAT address.
 */
const SESSION_WINDOW_MS = 60_000;
const SESSION_LIMIT_PER_IP = 20;

/** Leaving contact details is a rare act; this only stops a loop hammering it. */
const CONTACT_WINDOW_MS = 60_000;
const CONTACT_LIMIT = 5;

@Controller('widget')
export class WidgetController {
  constructor(
    private readonly widgetService: WidgetService,
    private readonly chatService: ChatService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Public()
  @HttpCode(200)
  @Post('session')
  async createSession(
    @Body() dto: CreateWidgetSessionDto,
    @Ip() ip: string,
    @Headers('origin') origin?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<WidgetSessionResult> {
    const key = `widget-session:${ip}`;

    if (
      !this.rateLimiter.consume(key, SESSION_LIMIT_PER_IP, SESSION_WINDOW_MS)
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many chat sessions from this address',
          retryAfter: this.rateLimiter.retryAfterSeconds(key),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.widgetService.createSession({
      publicKey: dto.publicKey,
      visitorKey: dto.visitorKey,
      origin,
      userAgent,
    });
  }

  /**
   * The conversation is taken from the token, never from the request, so a
   * visitor cannot read somebody else's thread. `before` walks backwards
   * through history as the visitor scrolls up.
   */
  @Public()
  @UseGuards(VisitorGuard)
  @Get('messages')
  async messages(
    @CurrentVisitor() visitor: VisitorJwtPayload,
    @Query() query: ListVisitorMessagesQuery,
  ) {
    const page = await this.chatService.listMessages(visitor.conversationId, {
      before: query.before,
      limit: query.limit,
    });

    return {
      messages: page.messages.map((message) => message.toJSON()),
      // Older pages can introduce staff the widget has not seen yet.
      agents: await this.widgetService.agentProfiles(
        page.messages.map((message) =>
          message.senderKind === 'agent' && message.senderId
            ? String(message.senderId)
            : null,
        ),
      ),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  @Public()
  @UseGuards(VisitorGuard)
  @Get('availability')
  availability(@CurrentVisitor() visitor: VisitorJwtPayload) {
    return this.widgetService.availabilityForSite(visitor.siteId);
  }

  /**
   * Lets a visitor leave a name and email, which is what makes an out-of-hours
   * conversation answerable later. The visitor is taken from the token, so this
   * can only ever write to the caller's own record.
   */
  @Public()
  @UseGuards(VisitorGuard)
  @HttpCode(200)
  @Post('contact')
  async saveContact(
    @CurrentVisitor() visitor: VisitorJwtPayload,
    @Body() dto: VisitorContactDto,
  ) {
    const key = `widget-contact:${visitor.sub}`;

    if (!this.rateLimiter.consume(key, CONTACT_LIMIT, CONTACT_WINDOW_MS)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Bạn thử lại sau một chút nhé.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const updated = await this.chatService.updateVisitorContact(visitor.sub, {
      name: dto.name?.trim(),
      email: dto.email?.trim(),
    });

    return { name: updated?.name ?? null, email: updated?.email ?? null };
  }
}
