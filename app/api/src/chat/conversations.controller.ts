import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { encodeCursor } from './history-cursor.js';
import { InternalNotesService } from './internal-notes.service.js';
import { agentProfileOf } from '../users/user.schema.js';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { ChatService, type ConversationAssignment } from './chat.service.js';
import { SitesService, type SiteAccess } from '../sites/sites.service.js';
import { UsersService } from '../users/users.service.js';

import { RealtimeBusService } from '../realtime/realtime-bus.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import type {
  ConversationDocument,
  ConversationStatus,
} from './conversation.schema.js';
import type { SiteDocument } from '../sites/site.schema.js';

export class ListConversationsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: ConversationStatus;

  @IsOptional()
  @IsIn(['all', 'mine', 'unassigned'])
  assignment?: ConversationAssignment;

  /** `lastMessageAt` of the oldest row already shown. */
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

export class ListMessagesQuery {
  /** `createdAt` of the oldest message already shown. */
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

export class AssignConversationDto {
  @IsMongoId()
  agentId!: string;
}

export class CreateInternalNoteDto {
  @IsString()
  @MaxLength(4000)
  @Matches(/\S/, { message: 'Ghi chú không được để trống.' })
  body!: string;
}

export class ListInternalNotesQuery {
  @IsOptional()
  @IsMongoId()
  before?: string;
}

const DEFAULT_PAGE_SIZE = 30;

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly chatService: ChatService,
    private readonly sitesService: SitesService,
    private readonly users: UsersService,
    private readonly bus: RealtimeBusService,
    private readonly internalNotes: InternalNotesService,
  ) {}

  @Get('unread-counts')
  async unreadCounts(@CurrentUser() actor: JwtPayload) {
    const sites = await this.sitesService.listAccessible(actor.sub);
    return this.chatService.unreadCounts(sites.map((site) => String(site._id)));
  }

  /**
   * The agent inbox, scoped to the projects the caller belongs to. The scope
   * comes from the session, never from a query parameter, so there is no way to
   * ask for somebody else's project.
   */
  @Get()
  async list(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListConversationsQuery,
  ) {
    const sites = await this.sitesService.listAccessible(currentUser.sub);
    const siteIds = sites.map((site) => String(site._id));
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    const conversations = await this.chatService.listConversations({
      siteIds,
      status: query.status,
      assignment: query.assignment,
      agentId: currentUser.sub,
      before: query.before,
      search: query.search,
      limit: limit + 1,
    });

    const hasMore = conversations.length > limit;
    const page = conversations.slice(0, limit);

    const [counts, serialized] = await Promise.all([
      this.counts(siteIds, currentUser.sub),
      this.serializeMany(page, sites),
    ]);

    return {
      conversations: serialized,
      counts,
      hasMore,
      nextCursor:
        hasMore && page.length
          ? encodeCursor(
              page[page.length - 1].lastMessageAt,
              page[page.length - 1]._id,
            )
          : null,
      // `access` lets the inbox hide owner-only actions without asking per
      // conversation; listAccessible already guarantees one of the two.
      projects: sites.map((site) => ({
        id: String(site._id),
        name: site.name,
        access: String(site.ownerId) === currentUser.sub ? 'owner' : 'manager',
      })),
    };
  }

  @Get(':id/notes')
  async notes(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Query() query: ListInternalNotesQuery,
  ) {
    await this.loadAccessible(id, currentUser.sub);
    return this.internalNotes.list(id, query.before);
  }

  @Post(':id/notes')
  async addNote(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateInternalNoteDto,
  ) {
    await this.loadAccessible(id, currentUser.sub);
    const author = await this.users.findById(currentUser.sub);
    if (!author) throw new ForbiddenException('Phiên làm việc không hợp lệ.');
    // Never publish notes to conversation rooms: those also contain visitors.
    return { note: await this.internalNotes.create(id, currentUser.sub, author.name, dto.body.trim()) };
  }

  @Get(':id/messages')
  async messages(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Query() query: ListMessagesQuery,
  ) {
    const { conversation, site } = await this.loadAccessible(
      id,
      currentUser.sub,
    );

    const page = await this.chatService.listMessages(id, {
      before: query.before,
      limit: query.limit,
    });

    return {
      conversation: await this.serialize(conversation, site),
      messages: page.messages.map((message) => message.toJSON()),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Taking a thread for yourself. Conditional on it still being free, so two
   * agents pressing the button together cannot both end up owning it.
   */
  @HttpCode(200)
  @Post(':id/claim')
  async claim(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string) {
    const { conversation, site } = await this.loadAccessible(
      id,
      currentUser.sub,
    );

    if (String(conversation.assignedAgentId ?? '') === currentUser.sub) {
      return { conversation: await this.serialize(conversation, site) };
    }

    const updated = await this.chatService.assignConversation(
      id,
      currentUser.sub,
      {
        expectUnassigned: true,
      },
    );

    if (!updated) {
      const latest = await this.chatService.findConversationById(id);
      const holder = latest?.assignedAgentId
        ? await this.users.findById(String(latest.assignedAgentId))
        : null;

      throw new ConflictException(
        `Hội thoại này vừa được ${holder?.name ?? 'một nhân viên khác'} nhận.`,
      );
    }

    return { conversation: await this.publish(updated, site) };
  }

  /** Handing a thread to a colleague. Only the project owner may do this. */
  @HttpCode(200)
  @Post(':id/assign')
  async assign(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
  ) {
    const { site } = await this.loadAccessible(id, currentUser.sub, {
      requireOwner: true,
    });

    // Assigning somebody who cannot open the project would park the thread
    // where nobody can answer it.
    if (
      (await this.sitesService.accessFor(String(site._id), dto.agentId)) ===
      'none'
    ) {
      throw new BadRequestException(
        'Người này không thuộc dự án, hãy thêm vào dự án trước.',
      );
    }

    if (!(await this.users.findById(dto.agentId))) {
      throw new BadRequestException('Assignment target no longer exists');
    }
    const updated = await this.chatService.assignConversation(id, dto.agentId);

    if (!updated) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    return { conversation: await this.publish(updated, site) };
  }

  /** Letting a thread go, by whoever holds it or by the project owner. */
  @HttpCode(200)
  @Post(':id/release')
  async release(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
  ) {
    const { conversation, site, access } = await this.loadAccessible(
      id,
      currentUser.sub,
    );
    const holder = String(conversation.assignedAgentId ?? '');

    if (holder && holder !== currentUser.sub && access !== 'owner') {
      throw new ForbiddenException(
        'Chỉ người đang phụ trách hoặc người tạo dự án được bỏ phân công.',
      );
    }

    const updated = await this.chatService.assignConversation(id, null, { expectedAgentId: holder || null });

    if (!updated) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    return { conversation: await this.publish(updated, site) };
  }

  @HttpCode(200)
  @Post(':id/close')
  async close(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string) {
    return this.changeStatus(currentUser, id, 'closed');
  }

  @HttpCode(200)
  @Post(':id/reopen')
  async reopen(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.changeStatus(currentUser, id, 'open');
  }

  private async changeStatus(
    currentUser: JwtPayload,
    id: string,
    status: ConversationStatus,
  ) {
    const { conversation, site } = await this.loadAccessible(
      id,
      currentUser.sub,
    );

    if (conversation.status === status) {
      return { conversation: await this.serialize(conversation, site) };
    }

    const updated = await this.chatService.setConversationStatus(id, status);

    if (!updated) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    const actor = await this.users.findById(currentUser.sub);
    const note =
      status === 'closed'
        ? `Hội thoại đã được kết thúc bởi ${actor?.name ?? 'nhân viên hỗ trợ'}.`
        : `Hội thoại đã được mở lại bởi ${actor?.name ?? 'nhân viên hỗ trợ'}.`;

    const message = await this.chatService.appendSystemMessage(
      id,
      String(site._id),
      note,
    );

    // The visitor's widget shows the same note, so a closed chat does not just
    // go quiet on them.
    this.bus.emitToConversation(id, 'message:new', message.toJSON());

    return { conversation: await this.publish(updated, site) };
  }

  // --- Helpers --------------------------------------------------------------

  private async counts(siteIds: string[], agentId: string) {
    const [open, mine, unassigned, closed] = await Promise.all([
      this.chatService.countConversations({ siteIds, status: 'open' }),
      this.chatService.countConversations({
        siteIds,
        assignment: 'mine',
        agentId,
      }),
      this.chatService.countConversations({
        siteIds,
        status: 'open',
        assignment: 'unassigned',
      }),
      this.chatService.countConversations({ siteIds, status: 'closed' }),
    ]);

    return { open, mine, unassigned, closed };
  }

  private async loadAccessible(
    id: string,
    userId: string,
    options: { requireOwner?: boolean } = {},
  ): Promise<{
    conversation: ConversationDocument;
    site: SiteDocument;
    access: Exclude<SiteAccess, 'none'>;
  }> {
    const conversation = await this.chatService.findConversationById(id);

    if (!conversation) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    const site = await this.sitesService.findById(String(conversation.siteId));

    if (!site) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    const access = await this.sitesService.accessForSite(site, userId);

    // Indistinguishable from "does not exist", so the id space cannot be
    // probed for other projects' conversations.
    if (access === 'none') {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (options.requireOwner && access !== 'owner') {
      throw new ForbiddenException(
        'Chỉ người tạo dự án được chuyển hội thoại cho người khác.',
      );
    }

    return { conversation, site, access };
  }

  /** Serializes, then pushes to everyone watching the project. */
  private async publish(
    conversation: ConversationDocument,
    site: SiteDocument,
  ) {
    const json = await this.serialize(conversation, site);

    this.bus.emitToSite(String(site._id), 'conversation:updated', json);
    await this.publishAssignment(conversation);

    return json;
  }

  /**
   * Tells the visitor's own widget who is handling them now, so the chat box
   * stops saying "Chat" and starts naming the person who just picked it up.
   *
   * Deliberately a separate, narrow event rather than the inbox payload above:
   * that one carries the visitor's email and the project id, which have no
   * business being broadcast into a chat box on a public website.
   */
  private async publishAssignment(
    conversation: ConversationDocument,
  ): Promise<void> {
    const assignedAgentId = conversation.assignedAgentId
      ? String(conversation.assignedAgentId)
      : null;
    const agent = assignedAgentId
      ? await this.users.findById(assignedAgentId)
      : null;

    this.bus.emitToConversation(String(conversation._id), 'agent:assigned', {
      agent: agent ? agentProfileOf(agent) : null,
    });
  }

  private async serialize(
    conversation: ConversationDocument,
    site: SiteDocument,
  ) {
    return (await this.serializeMany([conversation], [site]))[0];
  }

  private async serializeMany(
    conversations: ConversationDocument[],
    sites: SiteDocument[],
  ) {
    const siteNameById = new Map(
      sites.map((site) => [String(site._id), site.name]),
    );

    const visitors = await this.chatService.listVisitorsByIds(
      conversations.map((conversation) => String(conversation.visitorId)),
    );
    const visitorById = new Map(
      visitors.map((visitor) => [String(visitor._id), visitor]),
    );

    const agents = await this.users.findManyByIds([
      ...new Set(
        conversations
          .map((conversation) => String(conversation.assignedAgentId ?? ''))
          .filter(Boolean),
      ),
    ]);
    const agentNameById = new Map(
      agents.map((agent) => [String(agent._id), agent.name]),
    );

    return conversations.map((conversation) => {
      const visitor = visitorById.get(String(conversation.visitorId));
      // The schema's toJSON transform returns a plain object, which the
      // inferred document type does not express.
      const json = conversation.toJSON() as unknown as Record<string, unknown>;
      const assignedAgentId = String(conversation.assignedAgentId ?? '');

      return {
        ...json,
        siteName: siteNameById.get(String(conversation.siteId)) ?? null,
        assignedAgentName: assignedAgentId
          ? (agentNameById.get(assignedAgentId) ?? null)
          : null,
        visitor: visitor
          ? {
              id: String(visitor._id),
              name: visitor.name ?? null,
              email: visitor.email ?? null,
            }
          : null,
      };
    });
  }
}
