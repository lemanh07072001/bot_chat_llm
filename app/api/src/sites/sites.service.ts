import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OfficeHours,
  Site,
  SiteDocument,
  WidgetSettings,
} from './site.schema.js';
import { SiteMember, SiteMemberDocument } from './site-member.schema.js';

export interface CreateSiteInput {
  name: string;
  ownerId: string;
  allowedOrigins?: string[];
  settings?: Partial<WidgetSettings>;
  officeHours?: Partial<OfficeHours>;
}

export interface UpdateSiteInput {
  name?: string;
  allowedOrigins?: string[];
  settings?: Partial<WidgetSettings>;
  officeHours?: Partial<OfficeHours>;
  active?: boolean;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Drops keys whose value is `undefined`.
 *
 * A validated DTO instance declares every optional field, so the ones the
 * request left out still exist as own properties holding `undefined`. Copying
 * those onto a subdocument would wipe the stored values the caller never
 * mentioned, which fails validation on `required` fields and would silently
 * lose data on the rest.
 */
function definedOnly<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** "08:30" to 510. Returns null for anything that is not HH:mm. */
function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/** What a given person may do with a given project. */
export type SiteAccess = 'owner' | 'manager' | 'none';

@Injectable()
export class SitesService {
  constructor(
    @InjectModel(Site.name) private readonly siteModel: Model<SiteDocument>,
    @InjectModel(SiteMember.name)
    private readonly memberModel: Model<SiteMemberDocument>,
  ) {}

  static generatePublicKey(): string {
    return `pk_${randomBytes(16).toString('hex')}`;
  }

  async create(input: CreateSiteInput): Promise<SiteDocument> {
    return this.siteModel.create({
      name: input.name,
      ownerId: new Types.ObjectId(input.ownerId),
      publicKey: SitesService.generatePublicKey(),
      allowedOrigins: input.allowedOrigins ?? [],
      settings: input.settings ?? {},
      officeHours: input.officeHours ?? {},
    });
  }

  async listByOwner(ownerId: string): Promise<SiteDocument[]> {
    return this.siteModel
      .find({ ownerId: new Types.ObjectId(ownerId), deletedAt: null })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Every project the person may open: the ones they created plus the ones
   * they were added to. This is the only place that answers that question, so
   * conversations, messages and socket rooms all scope the same way.
   */
  async listAccessible(userId: string): Promise<SiteDocument[]> {
    const objectId = new Types.ObjectId(userId);
    const memberships = await this.memberModel
      .find({ userId: objectId })
      .select('siteId')
      .lean()
      .exec();

    return this.siteModel
      .find({
        deletedAt: null,
        $or: [
          { ownerId: objectId },
          { _id: { $in: memberships.map((membership) => membership.siteId) } },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async accessibleSiteIds(userId: string): Promise<string[]> {
    return (await this.listAccessible(userId)).map((site) => String(site._id));
  }

  async accessFor(siteId: string, userId: string): Promise<SiteAccess> {
    const site = await this.findById(siteId);

    if (!site) {
      return 'none';
    }

    return this.accessForSite(site, userId);
  }

  async accessForSite(site: SiteDocument, userId: string): Promise<SiteAccess> {
    if (site.deletedAt) return 'none';
    if (String(site.ownerId) === userId) {
      return 'owner';
    }

    if (!Types.ObjectId.isValid(userId)) {
      return 'none';
    }

    const membership = await this.memberModel
      .exists({ siteId: site._id, userId: new Types.ObjectId(userId) })
      .exec();

    return membership ? 'manager' : 'none';
  }

  async findById(id: string): Promise<SiteDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const site = await this.siteModel.findById(id).exec();
    return site?.deletedAt ? null : site;
  }

  async findByPublicKey(publicKey: string): Promise<SiteDocument | null> {
    return this.siteModel.findOne({ publicKey, deletedAt: null }).exec();
  }

  async update(id: string, input: UpdateSiteInput): Promise<SiteDocument> {
    const site = await this.findById(id);

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    if (input.name !== undefined) {
      site.name = input.name;
    }
    if (input.allowedOrigins !== undefined) {
      site.allowedOrigins = input.allowedOrigins;
    }
    if (input.active !== undefined) {
      site.active = input.active;
    }
    // Merged field by field so a request that mentions one setting does not
    // blank the others — see definedOnly().
    if (input.settings !== undefined) {
      Object.assign(site.settings, definedOnly(input.settings));
    }
    if (input.officeHours !== undefined) {
      Object.assign(site.officeHours, definedOnly(input.officeHours));
    }

    return site.save();
  }

  async softDelete(id: string): Promise<void> {
    await this.siteModel.updateOne({ _id: new Types.ObjectId(id), deletedAt: null }, { $set: { deletedAt: new Date(), active: false } }).exec();
  }

  async rotatePublicKey(id: string): Promise<SiteDocument> {
    const site = await this.findById(id);

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    site.publicKey = SitesService.generatePublicKey();

    return site.save();
  }

  // --- Membership -----------------------------------------------------------

  async listMemberships(siteId: string): Promise<SiteMemberDocument[]> {
    return this.memberModel
      .find({ siteId: new Types.ObjectId(siteId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * How many managers each project has, in one query rather than one per
   * project, so the project list can show a headcount.
   */
  async memberCounts(siteIds: string[]): Promise<Map<string, number>> {
    if (siteIds.length === 0) {
      return new Map();
    }

    const rows = await this.memberModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { siteId: { $in: siteIds.map((id) => new Types.ObjectId(id)) } } },
        { $group: { _id: '$siteId', count: { $sum: 1 } } },
      ])
      .exec();

    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  /** Idempotent: adding somebody twice keeps the original row. */
  async addMember(
    siteId: string,
    userId: string,
    addedBy: string,
  ): Promise<SiteMemberDocument> {
    return this.memberModel
      .findOneAndUpdate(
        {
          siteId: new Types.ObjectId(siteId),
          userId: new Types.ObjectId(userId),
        },
        {
          $setOnInsert: {
            role: 'manager',
            addedBy: new Types.ObjectId(addedBy),
          },
        },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async removeMember(siteId: string, userId: string): Promise<boolean> {
    const result = await this.memberModel
      .deleteOne({
        siteId: new Types.ObjectId(siteId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    return result.deletedCount > 0;
  }

  /** Called when an account is deleted or demoted, to drop its project access. */
  async removeAllMembershipsForUser(userId: string): Promise<void> {
    await this.memberModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  /**
   * Whether the project's declared office hours cover this instant. A project
   * with no schedule counts as always open: saying "ngoài giờ" to a visitor
   * when nobody has declared any hours would be a lie.
   *
   * The comparison is done in the project's own timezone via Intl, so it does
   * not depend on where the server runs. An overnight range (22:00–06:00) is
   * read as crossing midnight rather than as an empty window.
   */
  isWithinOfficeHours(site: SiteDocument, now: Date = new Date()): boolean {
    const hours = site.officeHours;

    if (!hours?.enabled) {
      return true;
    }

    if (
      !Array.isArray(hours.weekdays) ||
      hours.weekdays.length === 0 ||
      hours.weekdays.some(
        (day) => !Number.isInteger(day) || day < 0 || day > 6,
      ) ||
      typeof hours.from !== 'string' ||
      typeof hours.to !== 'string' ||
      !hours.timezone
    ) {
      return true;
    }

    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: hours.timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
    } catch {
      // An unusable timezone must not make the project look permanently shut.
      return true;
    }

    const find = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    const weekday = WEEKDAY_INDEX[find('weekday')];
    // Intl renders midnight as "24" in some runtimes.
    const hour = Number(find('hour')) % 24;
    const minutes = hour * 60 + Number(find('minute'));

    const from = toMinutes(hours.from);
    const to = toMinutes(hours.to);

    if (from === null || to === null || weekday === undefined) {
      return true;
    }

    if (from === to) {
      // A zero-length window is almost certainly a mistake, not "never open".
      return true;
    }

    if (from < to) {
      return (
        hours.weekdays.includes(weekday) && minutes >= from && minutes < to
      );
    }

    // Crosses midnight: the late part belongs to the day it started on.
    if (minutes >= from) {
      return hours.weekdays.includes(weekday);
    }

    const previousDay = (weekday + 6) % 7;

    return minutes < to && hours.weekdays.includes(previousDay);
  }

  /**
   * An empty allowlist means the snippet may be embedded anywhere, which is the
   * default so a freshly created site works on any page. A request with no
   * Origin header (server-side call, curl) is allowed only in that open mode.
   */
  isOriginAllowed(site: SiteDocument, origin: string | undefined): boolean {
    if (site.allowedOrigins.length === 0) {
      return true;
    }
    if (!origin) {
      return false;
    }
    return site.allowedOrigins.includes(origin);
  }
}
