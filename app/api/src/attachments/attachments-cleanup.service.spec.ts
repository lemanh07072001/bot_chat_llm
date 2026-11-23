import { Types } from 'mongoose';
import { vi } from 'vitest';
import {
  AttachmentsCleanupService,
  CLEANUP_BATCH_SIZE,
  CLEANUP_MARKER,
  UNCLAIMED_UPLOAD_TTL_MS,
} from './attachments-cleanup.service.js';

interface Row {
  _id: Types.ObjectId;
  key: string;
  usedAt: Date | null;
  createdAt: Date;
}

const NOW = new Date('2026-11-20T12:00:00Z');
const OLD = new Date(NOW.getTime() - UNCLAIMED_UPLOAD_TTL_MS - 1000);
const FRESH = new Date(NOW.getTime() - 1000);

function harness(rows: Row[], deleteResult: (key: string) => boolean = () => true) {
  const matches = (row: Row, filter: Record<string, any>) => {
    if (filter._id instanceof Types.ObjectId && !row._id.equals(filter._id)) return false;
    if (filter._id?.$gt && !(String(row._id) > String(filter._id.$gt))) return false;
    if (filter.createdAt?.$lt && !(row.createdAt < filter.createdAt.$lt)) return false;
    if (filter.usedAt?.$in) {
      const allowed = filter.usedAt.$in as Array<Date | null>;
      if (!allowed.some((v) => (v === null ? row.usedAt === null : row.usedAt?.getTime() === v.getTime()))) {
        return false;
      }
    } else if (filter.usedAt instanceof Date && row.usedAt?.getTime() !== filter.usedAt.getTime()) {
      return false;
    }
    return true;
  };
  const exec = <T>(value: () => T) => ({ exec: async () => value() });

  const uploadModel = {
    find: vi.fn((filter: Record<string, any>) => {
      let limit = Infinity;
      const chain = {
        sort: () => chain,
        limit: (n: number) => ((limit = n), chain),
        select: () => chain,
        lean: () => chain,
        exec: async () =>
          rows
            .filter((row) => matches(row, filter))
            .sort((a, b) => String(a._id).localeCompare(String(b._id)))
            .slice(0, limit)
            .map((row) => ({ _id: row._id, key: row.key })),
      };
      return chain;
    }),
    findOneAndUpdate: vi.fn((filter: Record<string, any>, update: { $set: { usedAt: Date } }) =>
      exec(() => {
        const row = rows.find((r) => matches(r, filter));
        if (row) row.usedAt = update.$set.usedAt;
        return row ?? null;
      }),
    ),
    updateOne: vi.fn((filter: Record<string, any>, update: { $set: { usedAt: Date | null } }) =>
      exec(() => {
        const row = rows.find((r) => matches(r, filter));
        if (row) row.usedAt = update.$set.usedAt;
      }),
    ),
    deleteOne: vi.fn((filter: Record<string, any>) =>
      exec(() => {
        const index = rows.findIndex((r) => matches(r, filter));
        if (index >= 0) rows.splice(index, 1);
      }),
    ),
  };
  const storage = { delete: vi.fn(async (key: string) => deleteResult(key)) };
  const config = { get: vi.fn(() => 'test') };
  const service = new AttachmentsCleanupService(uploadModel as never, storage as never, config as never);
  return { service, uploadModel, storage, config, rows };
}

function row(createdAt: Date, usedAt: Date | null = null, key = `attachments/s/${new Types.ObjectId()}.png`): Row {
  return { _id: new Types.ObjectId(), key, usedAt, createdAt };
}

describe('AttachmentsCleanupService', () => {
  it('removes old unclaimed uploads, object and row', async () => {
    const stale = row(OLD);
    const { service, storage, rows } = harness([stale]);

    await expect(service.sweep(NOW)).resolves.toBe(1);
    expect(storage.delete).toHaveBeenCalledWith(stale.key);
    expect(rows).toHaveLength(0);
  });

  it('keeps fresh uploads and uploads already attached', async () => {
    const fresh = row(FRESH);
    const used = row(OLD, new Date(OLD.getTime() + 5));
    const { service, storage, rows } = harness([fresh, used]);

    await expect(service.sweep(NOW)).resolves.toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(rows).toEqual([fresh, used]);
  });

  it('queries with the TTL cutoff on usedAt/createdAt', async () => {
    const { service, uploadModel } = harness([]);
    await service.sweep(NOW);
    expect(uploadModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        usedAt: { $in: [null, CLEANUP_MARKER] },
        createdAt: { $lt: new Date(NOW.getTime() - UNCLAIMED_UPLOAD_TTL_MS) },
      }),
    );
  });

  it('hands the row back when the object could not be deleted', async () => {
    const stale = row(OLD);
    const { service, rows } = harness([stale], () => false);

    await expect(service.sweep(NOW)).resolves.toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].usedAt).toBeNull();
  });

  it('skips a row claimed between the scan and the delete', async () => {
    const stale = row(OLD);
    const h = harness([stale]);
    const original = h.uploadModel.findOneAndUpdate.getMockImplementation()!;
    h.uploadModel.findOneAndUpdate.mockImplementationOnce((filter, update) => {
      stale.usedAt = new Date(); // a message attached it meanwhile
      return original(filter, update);
    });

    await expect(h.service.sweep(NOW)).resolves.toBe(0);
    expect(h.storage.delete).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(1);
  });

  it('works through several batches', async () => {
    const many = Array.from({ length: CLEANUP_BATCH_SIZE + 7 }, () => row(OLD));
    const { service, uploadModel, rows } = harness(many);

    await expect(service.sweep(NOW)).resolves.toBe(CLEANUP_BATCH_SIZE + 7);
    expect(rows).toHaveLength(0);
    expect(uploadModel.find.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [filter] of uploadModel.find.mock.calls) {
      expect(filter).toBeDefined();
    }
  });

  it('never throws when the database fails', async () => {
    const { service, uploadModel } = harness([]);
    uploadModel.find.mockImplementationOnce(() => {
      throw new Error('down');
    });
    await expect(service.sweep(NOW)).resolves.toBe(0);
  });

  it('schedules an unref’d hourly timer outside tests and clears it on destroy', () => {
    vi.useFakeTimers();
    try {
      const { service, config, uploadModel } = harness([]);
      config.get.mockReturnValue('production');
      service.onModuleInit();
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(uploadModel.find).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      expect(uploadModel.find).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
