import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { normalizeTemplates } from './canned-templates.js';
import { CannedResponsesService } from './canned-responses.service.js';
import type {
  GlobalCannedResponseSetDocument,
} from './canned-responses.schema.js';
import type { SiteDocument } from '../sites/site.schema.js';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const AGENT_ID = '507f1f77bcf86cd799439012';
const SITE_ID = '507f1f77bcf86cd799439013';

/** Minimal stand-in for the chainable mongoose query API the service uses. */
function query<T>(value: T) {
  return {
    lean: () => ({ exec: async () => value }),
    exec: async () => value,
  };
}

function site(overrides: Record<string, unknown> = {}): SiteDocument {
  return {
    _id: SITE_ID,
    deletedAt: null,
    cannedResponses: { mode: 'global', templates: [], version: 0 },
    ...overrides,
  } as unknown as SiteDocument;
}

function build(options: {
  globalDoc?: Record<string, unknown> | null;
  updatedGlobal?: Record<string, unknown> | null;
  siteDoc?: SiteDocument | null;
  access?: 'owner' | 'manager' | 'none';
  role?: 'admin' | 'agent';
} = {}) {
  const globalModel = {
    findOne: vi.fn(() => query(options.globalDoc ?? null)),
    create: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      version: 1,
    })),
    findOneAndUpdate: vi.fn(() => query(options.updatedGlobal ?? null)),
  };

  const sitesService = {
    findById: vi.fn(async () => (options.siteDoc === undefined ? site() : options.siteDoc)),
    accessForSite: vi.fn(async () => options.access ?? 'owner'),
    findOneAndUpdateCanned: vi.fn(async () =>
      options.siteDoc === undefined ? site() : options.siteDoc,
    ),
  };

  const usersService = {
    findById: vi.fn(async () => ({
      role: options.role ?? 'admin',
      emailVerified: true,
    })),
  };

  const service = new CannedResponsesService(
    globalModel as unknown as Model<GlobalCannedResponseSetDocument>,
    sitesService as never,
    usersService as never,
  );

  return { service, globalModel, sitesService, usersService };
}

describe('normalizeTemplates', () => {
  it('trims fields and drops blank extras', () => {
    expect(
      normalizeTemplates([{ title: '  Chào  ', shortcut: ' CHAO ', text: '  Xin chào  ' }]),
    ).toEqual([{ title: 'Chào', shortcut: 'chao', text: 'Xin chào' }]);
  });

  it('refuses a blank body', () => {
    expect(() => normalizeTemplates([{ text: '   ' }])).toThrow(/không được để trống/);
  });

  it('refuses two rows answering the same shortcut', () => {
    expect(() =>
      normalizeTemplates([
        { shortcut: 'gia', text: 'Giá là 100k' },
        { shortcut: 'GIA', text: 'Giá là 200k' },
      ]),
    ).toThrow(/bị dùng hai lần/);
  });

  it('keeps more than 30 replies from being saved', () => {
    const many = Array.from({ length: 31 }, (_value, index) => ({ text: `Mẫu ${index}` }));

    expect(() => normalizeTemplates(many)).toThrow(/tối đa 30/);
  });
});

describe('global set', () => {
  it('answers an empty set instead of failing on a fresh installation', async () => {
    const { service } = build();

    await expect(service.getGlobal()).resolves.toEqual({ templates: [], version: 0 });
  });

  it('creates the document on the first save', async () => {
    const { service, globalModel } = build({ globalDoc: null });

    const saved = await service.updateGlobal(ADMIN_ID, {
      version: 0,
      templates: [{ text: 'Xin chào' }],
    });

    expect(globalModel.create).toHaveBeenCalledWith({
      scope: 'global',
      templates: [{ text: 'Xin chào' }],
      version: 1,
    });
    expect(saved).toEqual({ templates: [{ text: 'Xin chào' }], version: 1 });
  });

  it('refuses a stale version with a conflict that carries the current set', async () => {
    const { service } = build({
      globalDoc: { templates: [{ text: 'Bản mới' }], version: 4 },
      updatedGlobal: null,
    });

    await expect(
      service.updateGlobal(ADMIN_ID, { version: 3, templates: [{ text: 'Bản của tôi' }] }),
    ).rejects.toMatchObject({
      response: { code: 'CANNED_CONFLICT', latest: { version: 4 } },
    });
  });

  it('only lets an admin write it', async () => {
    const { service, globalModel } = build({ role: 'agent' });

    await expect(
      service.updateGlobal(AGENT_ID, { version: 0, templates: [{ text: 'Xin chào' }] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(globalModel.create).not.toHaveBeenCalled();
  });
});

describe('project set', () => {
  it('is readable by a manager', async () => {
    const { service } = build({ access: 'manager' });

    await expect(service.getSite(SITE_ID, AGENT_ID)).resolves.toEqual({
      mode: 'global',
      templates: [],
      version: 0,
    });
  });

  it('is not writable by a manager', async () => {
    const { service, sitesService } = build({ access: 'manager' });

    await expect(
      service.updateSite(SITE_ID, AGENT_ID, { version: 0, templates: [{ text: 'Xin chào' }] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sitesService.findOneAndUpdateCanned).not.toHaveBeenCalled();
  });

  it('hides a project the caller cannot open', async () => {
    const { service } = build({ access: 'none' });

    await expect(service.getSite(SITE_ID, AGENT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('matches a project saved before the field existed', async () => {
    const { service, sitesService } = build({ access: 'owner' });

    await service.updateSite(SITE_ID, ADMIN_ID, {
      version: 0,
      templates: [{ text: 'Xin chào' }],
      mode: 'both',
    });

    const [_id, filter, update] = sitesService.findOneAndUpdateCanned.mock.calls[0] as unknown as [
      string,
      { $and: unknown[] },
      { $set: Record<string, unknown>; $inc: Record<string, number> },
    ];

    expect(JSON.stringify(filter)).toContain('$exists');
    expect(update.$set['cannedResponses.mode']).toBe('both');
    expect(update.$inc['cannedResponses.version']).toBe(1);
  });

  it('reports a conflict when another owner saved first', async () => {
    const { service, sitesService } = build({
      access: 'owner',
      siteDoc: site({ cannedResponses: { mode: 'global', templates: [], version: 7 } }),
    });
    sitesService.findOneAndUpdateCanned.mockResolvedValueOnce(null);

    await expect(
      service.updateSite(SITE_ID, ADMIN_ID, { version: 3, templates: [{ text: 'Của tôi' }] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('effective set', () => {
  it('returns both sets and the mode the composer must group by', async () => {
    const { service, sitesService } = build({
      siteDoc: site({
        cannedResponses: {
          mode: 'both',
          templates: [{ text: 'Riêng dự án' }],
          version: 2,
        },
      }),
      globalDoc: { templates: [{ text: 'Chung' }], version: 5 },
    });

    await expect(service.effective(SITE_ID, AGENT_ID)).resolves.toEqual({
      siteId: SITE_ID,
      mode: 'both',
      site: { templates: [{ text: 'Riêng dự án' }], version: 2 },
      global: { templates: [{ text: 'Chung' }], version: 5 },
    });
    expect(sitesService.accessForSite).toHaveBeenCalled();
  });
});
