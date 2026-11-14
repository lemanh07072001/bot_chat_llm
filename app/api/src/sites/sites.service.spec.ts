import type { Model } from 'mongoose';
import { SitesService } from './sites.service.js';
import type { SiteDocument } from './site.schema.js';
import type { SiteMemberDocument } from './site-member.schema.js';

const service = new SitesService(
  {} as unknown as Model<SiteDocument>,
  {} as unknown as Model<SiteMemberDocument>,
);

function site(officeHours: Record<string, unknown>): SiteDocument {
  return { officeHours } as unknown as SiteDocument;
}

/** 2026-01-05 is a Monday. */
const mondayNoonUtc = new Date('2026-01-05T05:00:00.000Z'); // 12:00 in Ho Chi Minh
const mondayNightUtc = new Date('2026-01-05T16:00:00.000Z'); // 23:00 in Ho Chi Minh
const sundayNoonUtc = new Date('2026-01-04T05:00:00.000Z'); // Sunday 12:00

const weekdays = [1, 2, 3, 4, 5];
const workingHours = {
  enabled: true,
  timezone: 'Asia/Ho_Chi_Minh',
  weekdays,
  from: '08:00',
  to: '17:30',
  offlineMessage: 'ngoài giờ',
};

describe('SitesService.isWithinOfficeHours', () => {
  it('treats a project with no declared hours as always open', () => {
    expect(
      service.isWithinOfficeHours(
        site({ ...workingHours, enabled: false }),
        mondayNightUtc,
      ),
    ).toBe(true);
    // Nothing stored at all, e.g. a project created before the feature existed.
    expect(service.isWithinOfficeHours(site({}), mondayNightUtc)).toBe(true);
  });

  it('is open inside the window and shut outside it', () => {
    expect(service.isWithinOfficeHours(site(workingHours), mondayNoonUtc)).toBe(
      true,
    );
    expect(
      service.isWithinOfficeHours(site(workingHours), mondayNightUtc),
    ).toBe(false);
  });

  it('respects the weekday list', () => {
    expect(service.isWithinOfficeHours(site(workingHours), sundayNoonUtc)).toBe(
      false,
    );
    expect(
      service.isWithinOfficeHours(
        site({ ...workingHours, weekdays: [0, ...weekdays] }),
        sundayNoonUtc,
      ),
    ).toBe(true);
  });

  it('reads the schedule in the project timezone, not the server one', () => {
    // 12:00 in Ho Chi Minh is 05:00 UTC, which is before a 08:00 London start.
    const london = { ...workingHours, timezone: 'Europe/London' };

    expect(service.isWithinOfficeHours(site(london), mondayNoonUtc)).toBe(
      false,
    );
    // 10:00 London on the same Monday.
    expect(
      service.isWithinOfficeHours(
        site(london),
        new Date('2026-01-05T10:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('handles a window that crosses midnight', () => {
    const nightShift = { ...workingHours, from: '22:00', to: '06:00' };

    // Monday 23:00 — inside, on the day the shift started.
    expect(service.isWithinOfficeHours(site(nightShift), mondayNightUtc)).toBe(
      true,
    );
    // Tuesday 02:00 local, which belongs to Monday's shift.
    expect(
      service.isWithinOfficeHours(
        site(nightShift),
        new Date('2026-01-05T19:00:00.000Z'),
      ),
    ).toBe(true);
    // Monday 12:00 — outside.
    expect(service.isWithinOfficeHours(site(nightShift), mondayNoonUtc)).toBe(
      false,
    );
    // Sunday 02:00 local would belong to Saturday's shift, which is not listed.
    expect(
      service.isWithinOfficeHours(
        site(nightShift),
        new Date('2026-01-03T19:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('falls back to open rather than permanently shut on bad data', () => {
    expect(
      service.isWithinOfficeHours(
        site({ ...workingHours, timezone: 'Not/AZone' }),
        mondayNightUtc,
      ),
    ).toBe(true);
    expect(
      service.isWithinOfficeHours(
        site({ ...workingHours, from: 'xx:yy' }),
        mondayNightUtc,
      ),
    ).toBe(true);
    for (const weekdays of [undefined, null, [], [7], ['1']]) {
      expect(
        service.isWithinOfficeHours(
          site({ ...workingHours, weekdays }),
          mondayNightUtc,
        ),
      ).toBe(true);
    }
    // A zero-length window is a mistake, not a project that never opens.
    expect(
      service.isWithinOfficeHours(
        site({ ...workingHours, from: '09:00', to: '09:00' }),
        mondayNoonUtc,
      ),
    ).toBe(true);
  });
});

describe('SitesService.update partial merges', () => {
  /**
   * A validated DTO carries every optional field, so the ones left out of the
   * request arrive as `undefined`. Copying those onto the stored subdocument
   * used to blank settings the caller never mentioned.
   */
  it('keeps the fields a request did not mention', async () => {
    const stored = {
      name: 'Website Demo',
      settings: { title: 'Chat', themeColor: '#0071E3', greeting: 'Xin chào' },
      officeHours: {
        enabled: false,
        timezone: 'Asia/Ho_Chi_Minh',
        weekdays: [1, 2, 3, 4, 5],
        from: '08:00',
        to: '17:30',
        offlineMessage: 'ngoài giờ',
      },
      save: async () => stored,
    };

    const scoped = new SitesService(
      {
        findById: () => ({ exec: async () => stored }),
      } as unknown as Model<SiteDocument>,
      {} as unknown as Model<SiteMemberDocument>,
    );

    await scoped.update('507f1f77bcf86cd799431001', {
      // Exactly what class-transformer hands over for `{ officeHours: { enabled: true } }`.
      officeHours: {
        enabled: true,
        timezone: undefined,
        weekdays: undefined,
        from: undefined,
        to: undefined,
        offlineMessage: undefined,
      },
      settings: { title: 'Hỗ trợ', themeColor: undefined, greeting: undefined },
    });

    expect(stored.officeHours).toMatchObject({
      enabled: true,
      timezone: 'Asia/Ho_Chi_Minh',
      from: '08:00',
      to: '17:30',
      offlineMessage: 'ngoài giờ',
    });
    expect(stored.settings).toEqual({
      title: 'Hỗ trợ',
      themeColor: '#0071E3',
      greeting: 'Xin chào',
    });
  });
});
