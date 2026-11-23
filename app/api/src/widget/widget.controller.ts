import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Ip,
  Logger,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
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
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateWidgetSessionDto } from './dto/create-widget-session.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { CurrentVisitor, VisitorGuard } from './visitor.guard.js';
import { RateLimiterService } from '../realtime/rate-limiter.service.js';
import { Public } from '../auth/public.decorator.js';
import type { VisitorJwtPayload } from '../auth/jwt-payload.type.js';
import { AttachmentUploadService } from '../attachments/attachment-upload.service.js';
import {
  AttachmentFileInterceptor,
  type UploadedImageFile,
} from '../attachments/attachment-file.interceptor.js';
import {
  UploadImageFieldsDto,
  requireFile,
  uploadName,
} from '../attachments/uploads.controller.js';
import { UploadAdmissionInterceptor } from '../attachments/upload-admission.interceptor.js';
import type { AttachmentView } from '../attachments/attachment.types.js';
import { AttachmentsService } from '../attachments/attachments.service.js';

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

/** A visitor rarely needs more than one ticket; this stops form spam. */
const TICKET_WINDOW_MS = 600_000;
const TICKET_LIMIT = 3;

@Controller('widget')
export class WidgetController {
  private readonly logger = new Logger(WidgetController.name);

  constructor(
    private readonly widgetService: WidgetService,
    private readonly chatService: ChatService,
    private readonly rateLimiter: RateLimiterService,
    private readonly notifications: NotificationsService,
    private readonly tickets: TicketsService,
    private readonly attachmentUploads: AttachmentUploadService,
    private readonly attachments: AttachmentsService,
  ) {}

  /**
   * One image for a later chat message or ticket. Owner, site and thread come
   * from the token, so the upload can only ever be attached in that thread.
   */
  @Public()
  @UseGuards(VisitorGuard)
  @HttpCode(200)
  @Post('uploads')
  // VisitorGuard first (sets request.visitor); then admission — maintenance,
  // per-visitor and per-IP limits, in-flight cap — before multer buffers.
  @UseInterceptors(UploadAdmissionInterceptor, AttachmentFileInterceptor)
  async uploadImage(
    @CurrentVisitor() visitor: VisitorJwtPayload,
    @Body() dto: UploadImageFieldsDto,
    @UploadedFile() file?: UploadedImageFile,
  ): Promise<AttachmentView> {
    const image = requireFile(file);

    return this.attachmentUploads.store({
      buffer: image.buffer,
      name: uploadName(dto.name, image),
      width: dto.width,
      height: dto.height,
      siteId: visitor.siteId,
      ownerKind: 'visitor',
      ownerId: visitor.sub,
      conversationId: visitor.conversationId,
    });
  }

  @Public()
  @HttpCode(200)
  @Post('session')
  async createSession(
    @Body() dto: CreateWidgetSessionDto,
    @Ip() ip: string,
    @Headers('origin') origin?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<WidgetSessionResult | { resumed: false }> {
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
      resumeOnly: dto.resumeOnly,
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

    // The stored details are read first: the bell belongs to the moment the
    // visitor actually leaves *new* information, not to every form submit.
    const before = await this.chatService.findVisitorById(visitor.sub);
    const changed = contactChanged(before, dto);

    const updated = await this.chatService.updateVisitorContact(visitor.sub, {
      name: dto.name?.trim(),
      email: dto.email?.trim(),
    });

    if (changed) {
      await this.notifyContactLeft(visitor, updated);
    }

    return { name: updated?.name ?? null, email: updated?.email ?? null };
  }

  /**
   * Leaves a ticket when nobody can answer right now. Visitor, site and thread
   * all come from the token; the contact details are stored on the visitor too.
   */
  @Public()
  @UseGuards(VisitorGuard)
  @HttpCode(200)
  @Post('tickets')
  async createTicket(
    @CurrentVisitor() visitor: VisitorJwtPayload,
    @Body() dto: CreateTicketDto,
  ): Promise<{ id: string; number: number }> {
    const key = `widget-ticket:${visitor.sub}`;

    if (!this.rateLimiter.consume(key, TICKET_LIMIT, TICKET_WINDOW_MS)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Bạn thử lại sau một chút nhé.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const name = dto.name?.trim() || undefined;
    const email = dto.email.trim();

    // A blank name keeps whatever the visitor record already holds.
    const updated = await this.chatService.updateVisitorContact(visitor.sub, {
      name,
      email,
    });

    const { attachments, claimedAt } = await this.attachments.claimWithStamp(dto.attachmentIds, {
      kind: 'visitor',
      id: visitor.sub,
      siteId: visitor.siteId,
      conversationId: visitor.conversationId,
    });

    // `create` only throws when the ticket itself was not stored; anything
    // after the insert is logged inside it, so releasing here is safe.
    let ticket: { id: string; number: number };
    try {
      ticket = await this.tickets.create({
        siteId: visitor.siteId,
        conversationId: visitor.conversationId,
        visitorId: visitor.sub,
        name: name ?? updated?.name ?? null,
        email,
        message: dto.message.trim(),
        attachments,
      });
    } catch (error) {
      await this.attachments
        .release(attachments.map((attachment) => attachment.id), claimedAt)
        .catch(() => undefined);
      throw error;
    }

    return { id: ticket.id, number: ticket.number };
  }

  /**
   * Tells the project's staff that this thread now has a name and an email.
   *
   * Never fails the request: the details are already stored, and losing a chime
   * must not show the visitor an error after a successful save.
   */
  private async notifyContactLeft(
    visitor: VisitorJwtPayload,
    updated: { name?: string | null; email?: string | null } | null,
  ): Promise<void> {
    try {
      const conversation = await this.chatService.findConversationById(
        visitor.conversationId,
      );

      if (!conversation) {
        return;
      }

      await this.notifications.onContactLeft({
        conversation,
        contact: {
          name: updated?.name ?? null,
          email: updated?.email ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Contact notification failed for visitor ${visitor.sub}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/** Trim, and lowercase the email the way the visitor schema stores it. */
function normalizeContact(contact: {
  name?: string | null;
  email?: string | null;
}): { name: string; email: string } {
  return {
    name: (contact.name ?? '').trim(),
    email: (contact.email ?? '').trim().toLowerCase(),
  };
}

/**
 * True when the submission differs from what is already stored. A blank field
 * means "unchanged" — the endpoint only ever adds details, never clears them —
 * so it is compared against the stored value instead of counting as a change.
 */
function contactChanged(
  before: { name?: string | null; email?: string | null } | null,
  dto: VisitorContactDto,
): boolean {
  const stored = normalizeContact(before ?? {});
  const name = dto.name?.trim() || null;
  const email = dto.email?.trim() || null;
  const next = normalizeContact({
    name: name ?? before?.name ?? null,
    email: email ?? before?.email ?? null,
  });

  return next.name !== stored.name || next.email !== stored.email;
}
