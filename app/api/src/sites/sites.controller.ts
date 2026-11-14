import { RealtimeBusService } from '../realtime/realtime-bus.service.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SitesService, type SiteAccess } from './sites.service.js';
import { CreateSiteDto, UpdateSiteDto } from './dto/create-site.dto.js';
import { AddSiteMemberDto } from './dto/site-member.dto.js';
import { SiteDocument } from './site.schema.js';
import { UsersService } from '../users/users.service.js';
import { AgentRegistryService } from '../realtime/agent-registry.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';

/** One row of a project's people list, owner first. */
export interface MemberView {
  userId: string;
  name: string;
  email: string | null;
  role: 'owner' | 'manager';
  addedAt: string | null;
}

@Controller('sites')
export class SitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly users: UsersService,
    private readonly agents: AgentRegistryService,
    private readonly config: ConfigService,
    private readonly bus: RealtimeBusService,
  ) {}

  /** Every project the caller may open, owned or granted. */
  @Get()
  async list(@CurrentUser() currentUser: JwtPayload) {
    const sites = await this.sitesService.listAccessible(currentUser.sub);
    const counts = await this.sitesService.memberCounts(sites.map((site) => String(site._id)));

    const presented = await Promise.all(
      sites.map(async (site) => {
        const access = await this.sitesService.accessForSite(site, currentUser.sub);

        // listAccessible already filtered by access; this only narrows the type.
        return access === 'none'
          ? null
          : this.present(site, access, {
              // The owner is not a membership row, so they are added back here.
              memberCount: (counts.get(String(site._id)) ?? 0) + 1,
            });
      }),
    );

    return presented.filter((site) => site !== null);
  }

  @Post()
  async create(@CurrentUser() currentUser: JwtPayload, @Body() dto: CreateSiteDto) {
    await this.assertAdmin(currentUser);

    const site = await this.sitesService.create({
      name: dto.name,
      ownerId: currentUser.sub,
      allowedOrigins: dto.allowedOrigins,
      settings: dto.settings,
      officeHours: dto.officeHours,
    });

    return this.present(site, 'owner');
  }

  @Get(':id')
  async findOne(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string) {
    const { site, access } = await this.loadWithAccess(id, currentUser.sub);

    return this.present(site, access);
  }

  @Patch(':id')
  async update(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    await this.assertOwner(id, currentUser.sub);

    const site = await this.sitesService.update(id, dto);
    if (dto.active !== undefined) this.bus.emitToVisitors(id, 'widget:maintenance', { maintenance: !site.active });

    return this.present(site, 'owner');
  }

  @Delete(':id')
  async remove(@CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    const site = await this.assertOwner(id, actor.sub);
    const members = await this.sitesService.listMemberships(id);
    await this.sitesService.softDelete(id);
    for (const userId of new Set([String(site.ownerId), ...members.map((member) => String(member.userId))])) {
      this.agents.revokeSite(userId, id);
    }
    return { deleted: true };
  }

  @Post(':id/rotate-key')
  async rotateKey(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string) {
    await this.assertOwner(id, currentUser.sub);

    const site = await this.sitesService.rotatePublicKey(id);

    return this.present(site, 'owner');
  }

  // --- Membership -----------------------------------------------------------

  /**
   * Readable by anyone on the project, because answering a conversation means
   * knowing which colleagues it can be handed to.
   */
  @Get(':id/members')
  async listMembers(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string) {
    const { site } = await this.loadWithAccess(id, currentUser.sub);

    return { members: await this.describeMembers(site) };
  }

  @Post(':id/members')
  async addMember(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddSiteMemberDto,
  ) {
    const site = await this.assertOwner(id, currentUser.sub);

    if (dto.userId === String(site.ownerId)) {
      throw new BadRequestException('Người tạo dự án đã có toàn quyền trên dự án này.');
    }

    const user = await this.users.findById(dto.userId);

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    await this.sitesService.addMember(id, dto.userId, currentUser.sub);
    // Their open inbox starts receiving this project right away, rather than
    // after the next reconnect.
    this.agents.grantSite(dto.userId, id);

    return { members: await this.describeMembers(site) };
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    const site = await this.assertOwner(id, currentUser.sub);

    const removed = await this.sitesService.removeMember(id, userId);

    if (!removed) {
      throw new NotFoundException('Người này không có trong dự án.');
    }

    // Closes the live feed immediately; the HTTP routes re-check anyway.
    this.agents.revokeSite(userId, id);

    return { members: await this.describeMembers(site) };
  }

  /** The owner is not a membership row, so it is added back here. */
  private async describeMembers(site: SiteDocument) {
    const owner = await this.users.findById(String(site.ownerId));
    const memberships = await this.sitesService.listMemberships(String(site._id));
    const users = await Promise.all(
      memberships.map((membership) => this.users.findById(String(membership.userId))),
    );

    const members: MemberView[] = [
      {
        userId: String(site.ownerId),
        name: owner?.name ?? 'Người tạo dự án',
        email: owner?.email ?? null,
        role: 'owner',
        addedAt: (site.get('createdAt') as Date | undefined)?.toISOString() ?? null,
      },
    ];

    memberships.forEach((membership, index) => {
      const user = users[index];

      // An account deleted outside this flow leaves a dangling row; skip it
      // rather than rendering a blank person.
      if (!user) {
        return;
      }

      members.push({
        userId: String(membership.userId),
        name: user.name,
        email: user.email,
        role: membership.role,
        addedAt: (membership.get('createdAt') as Date | undefined)?.toISOString() ?? null,
      });
    });

    return members;
  }

  // --- Guards ---------------------------------------------------------------

  /** Reads the current database role rather than trusting a stale JWT claim. */
  private async assertAdmin(currentUser: JwtPayload): Promise<void> {
    const current = await this.users.findById(currentUser.sub);

    if (!current || current.role !== 'admin' || !current.emailVerified) {
      throw new ForbiddenException('Chỉ quản trị viên được tạo dự án mới.');
    }
  }

  private async loadWithAccess(
    id: string,
    userId: string,
  ): Promise<{ site: SiteDocument; access: Exclude<SiteAccess, 'none'> }> {
    const site = await this.sitesService.findById(id);

    // Same answer for "does not exist" and "not yours", so the endpoint cannot
    // be used to discover other people's projects.
    if (!site) {
      throw new NotFoundException('Không tìm thấy dự án.');
    }

    const access = await this.sitesService.accessForSite(site, userId);

    if (access === 'none') {
      throw new NotFoundException('Không tìm thấy dự án.');
    }

    return { site, access };
  }

  private async assertOwner(id: string, userId: string): Promise<SiteDocument> {
    const { site, access } = await this.loadWithAccess(id, userId);

    if (access !== 'owner') {
      throw new ForbiddenException('Chỉ người tạo dự án được thay đổi cấu hình dự án.');
    }

    return site;
  }

  // --- Serialization --------------------------------------------------------

  /**
   * A manager only ever gets what they need to answer chats. The public key,
   * the embed snippet and the origin allowlist belong to whoever installs the
   * widget, which is the owner.
   */
  private present(
    site: SiteDocument,
    access: Exclude<SiteAccess, 'none'>,
    extra: { memberCount?: number } = {},
  ) {
    // The schema's toJSON transform returns a plain object, which the inferred
    // document type does not express.
    const json = site.toJSON() as unknown as Record<string, unknown>;

    if (access === 'manager') {
      const { publicKey: _publicKey, allowedOrigins: _allowedOrigins, ownerId: _ownerId, ...rest } = json;

      return { ...rest, ...extra, access };
    }

    const widgetUrl = this.widgetUrl();
    const apiUrl = this.config.get<string>('PUBLIC_API_URL');
    // The widget falls back to `<origin of its own script>/api`, so the
    // attribute is only worth shipping when the api lives somewhere else.
    const apiAttribute =
      apiUrl && !this.isDerivableFromWidgetUrl(apiUrl, widgetUrl)
        ? ` data-api-url="${escapeAttribute(apiUrl)}"`
        : '';

    return {
      ...json,
      ...extra,
      access,
      embedSnippet: `<script src="${escapeAttribute(widgetUrl)}"${apiAttribute} data-chat-center-key="${site.publicKey}" async></script>`,
    };
  }

  /**
   * The bundle is served by this api (see WidgetAssetController), so the
   * default is derived from the api's own public url rather than configured
   * twice. WIDGET_URL still overrides it, which is what a CDN deployment needs.
   */
  private widgetUrl(): string {
    const configured = this.config.get<string>('WIDGET_URL');

    if (configured) {
      return configured;
    }

    const apiUrl = this.config.get<string>('PUBLIC_API_URL');

    try {
      return new URL('/v1/widget.js', apiUrl).toString();
    } catch {
      return 'http://localhost:3002/v1/widget.js';
    }
  }

  private isDerivableFromWidgetUrl(apiUrl: string, widgetUrl: string): boolean {
    try {
      return new URL('/api', widgetUrl).toString() === new URL(apiUrl).toString();
    } catch {
      return false;
    }
  }
}

/** The snippet is HTML the admin panel renders, so attribute values are escaped. */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
