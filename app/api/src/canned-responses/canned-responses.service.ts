import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  type CannedMode,
  type CannedTemplate,
  type SiteDocument,
} from '../sites/site.schema.js';
import { SitesService } from '../sites/sites.service.js';
import { UsersService } from '../users/users.service.js';
import {
  GlobalCannedResponseSet,
  type GlobalCannedResponseSetDocument,
} from './canned-responses.schema.js';
import type { CannedTemplateDto } from './canned-responses.dto.js';
import { normalizeTemplates } from './canned-templates.js';

export type CannedSetView = {
  templates: CannedTemplate[];
  version: number;
};

export type SiteCannedSetView = CannedSetView & { mode: CannedMode };

/** What the composer needs in one call: which sets apply, and their contents. */
export type EffectiveCannedResponses = {
  siteId: string;
  mode: CannedMode;
  site: CannedSetView;
  global: CannedSetView;
};

@Injectable()
export class CannedResponsesService {
  constructor(
    @InjectModel(GlobalCannedResponseSet.name)
    private readonly globalModel: Model<GlobalCannedResponseSetDocument>,
    private readonly sites: SitesService,
    private readonly users: UsersService,
  ) {}

  // --- Global set -----------------------------------------------------------

  /** Never creates the document; an installation with no set simply has none. */
  async getGlobal(): Promise<CannedSetView> {
    const found = await this.globalModel
      .findOne({ scope: 'global' })
      .lean()
      .exec();

    return {
      templates: (found?.templates ?? []) as CannedTemplate[],
      version: found?.version ?? 0,
    };
  }

  async updateGlobal(
    actorId: string,
    dto: { version: number; templates: CannedTemplateDto[] },
  ): Promise<CannedSetView> {
    await this.assertAdmin(actorId);

    const templates = normalizeTemplates(dto.templates);

    if (dto.version === 0) {
      // The first save creates the document. A concurrent first save loses the
      // unique-index race instead of silently forking the set.
      try {
        const created = await this.globalModel.create({
          scope: 'global',
          templates,
          version: 1,
        });

        return { templates: created.templates as CannedTemplate[], version: created.version };
      } catch (error: unknown) {
        if (!this.isDuplicateKey(error)) {
          throw error;
        }
      }
    }

    const updated = await this.globalModel
      .findOneAndUpdate(
        { scope: 'global', version: dto.version },
        { $set: { templates }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw this.conflict(await this.getGlobal());
    }

    return { templates: updated.templates as CannedTemplate[], version: updated.version };
  }

  // --- Per-project set ------------------------------------------------------

  async getSite(siteId: string, userId: string): Promise<SiteCannedSetView> {
    const site = await this.loadWithAccess(siteId, userId);

    return this.presentSite(site);
  }

  async updateSite(
    siteId: string,
    userId: string,
    dto: { version: number; templates: CannedTemplateDto[]; mode?: CannedMode },
  ): Promise<SiteCannedSetView> {
    const site = await this.loadWithAccess(siteId, userId);

    if ((await this.sites.accessForSite(site, userId)) !== 'owner') {
      throw new ForbiddenException(
        'Chỉ người tạo dự án được sửa mẫu câu dùng chung của dự án.',
      );
    }

    const templates = normalizeTemplates(dto.templates);

    // Version 0 also matches a project saved before this field existed, whose
    // subdocument is missing entirely.
    const versionMatch =
      dto.version === 0
        ? {
            $or: [
              { 'cannedResponses.version': 0 },
              { 'cannedResponses.version': { $exists: false } },
            ],
          }
        : { 'cannedResponses.version': dto.version };

    const updated = await this.sites
      .findOneAndUpdateCanned(
        siteId,
        {
          $and: [
            { _id: new Types.ObjectId(siteId), deletedAt: null },
            versionMatch,
          ],
        },
        {
          $set: {
            'cannedResponses.templates': templates,
            ...(dto.mode ? { 'cannedResponses.mode': dto.mode } : {}),
          },
          $inc: { 'cannedResponses.version': 1 },
        },
      );

    if (!updated) {
      // Either the project vanished mid-edit or somebody else saved first.
      const current = await this.sites.findById(siteId);

      if (!current) {
        throw new NotFoundException('Không tìm thấy dự án.');
      }

      throw this.conflict(this.presentSite(current));
    }

    return this.presentSite(updated);
  }

  /**
   * The sets that actually appear in the composer for a conversation, already
   * narrowed by the project's mode. Sent as one payload because the composer
   * needs all three facts to group the results.
   */
  async effective(
    siteId: string,
    userId: string,
  ): Promise<EffectiveCannedResponses> {
    const site = await this.loadWithAccess(siteId, userId);
    const siteView = this.presentSite(site);

    return {
      siteId: String(site._id),
      mode: siteView.mode,
      site: { templates: siteView.templates, version: siteView.version },
      global: await this.getGlobal(),
    };
  }

  // --- helpers --------------------------------------------------------------

  private presentSite(site: SiteDocument): SiteCannedSetView {
    const stored = site.cannedResponses;

    return {
      mode: stored?.mode ?? 'global',
      templates: (stored?.templates ?? []) as CannedTemplate[],
      version: stored?.version ?? 0,
    };
  }

  private async loadWithAccess(
    siteId: string,
    userId: string,
  ): Promise<SiteDocument> {
    const site = await this.sites.findById(siteId);

    // Same answer for "not there" and "not yours": the endpoint must not be a
    // way to discover other people's projects.
    if (!site) {
      throw new NotFoundException('Không tìm thấy dự án.');
    }

    if ((await this.sites.accessForSite(site, userId)) === 'none') {
      throw new NotFoundException('Không tìm thấy dự án.');
    }

    return site;
  }

  /** Reads the current database role rather than trusting a stale JWT claim. */
  private async assertAdmin(userId: string): Promise<void> {
    const current = await this.users.findById(userId);

    if (!current || current.role !== 'admin' || !current.emailVerified) {
      throw new ForbiddenException(
        'Chỉ quản trị viên được sửa bộ mẫu câu dùng chung.',
      );
    }
  }

  private conflict(latest: CannedSetView): ConflictException {
    return new ConflictException({
      message:
        'Người khác vừa sửa bộ mẫu này. Tải bản mới nhất rồi thử lại, hoặc ghi đè bằng bản mới.',
      code: 'CANNED_CONFLICT',
      latest,
    });
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
