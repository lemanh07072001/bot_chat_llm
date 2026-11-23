import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { vi } from 'vitest';
import { AttachmentsService, type AttachmentOwner } from './attachments.service.js';

const SITE_ID = '507f1f77bcf86cd799440301';
const VISITOR_ID = '507f1f77bcf86cd799440302';
const CONVERSATION_ID = '507f1f77bcf86cd799440303';

interface StoredUpload {
  _id: Types.ObjectId;
  url: string;
  mimeType: 'image/png';
  size: number;
  width: number | null;
  height: number | null;
  name: string | null;
  siteId: Types.ObjectId;
  ownerKind: 'visitor' | 'agent';
  ownerId: Types.ObjectId;
  conversationId: Types.ObjectId | null;
  usedAt: Date | null;
}

function upload(overrides: Partial<StoredUpload> = {}): StoredUpload {
  const _id = new Types.ObjectId();
  return {
    _id,
    url: `http://localhost/api/attachments/${String(_id)}.png`,
    mimeType: 'image/png',
    size: 10,
    width: 4,
    height: 3,
    name: 'a.png',
    siteId: new Types.ObjectId(SITE_ID),
    ownerKind: 'visitor',
    ownerId: new Types.ObjectId(VISITOR_ID),
    conversationId: new Types.ObjectId(CONVERSATION_ID),
    usedAt: null,
    ...overrides,
  };
}

const same = (a: unknown, b: unknown) => a == null ? b == null : b != null && String(a) === String(b);

/** In-memory stand-in for the two model calls the service makes. */
function harness(rows: StoredUpload[]) {
  const uploadModel = {
    findOneAndUpdate: vi.fn((filter: Record<string, unknown>, update: { $set: { usedAt: Date } }) => ({
      exec: async () => {
        const row = rows.find(
          (r) =>
            same(r._id, filter._id) &&
            r.ownerKind === filter.ownerKind &&
            same(r.ownerId, filter.ownerId) &&
            same(r.siteId, filter.siteId) &&
            r.usedAt === null &&
            (!('conversationId' in filter) || same(r.conversationId, filter.conversationId)),
        );
        if (!row) return null;
        row.usedAt = update.$set.usedAt;
        return row;
      },
    })),
    updateMany: vi.fn((filter: { _id: { $in: Types.ObjectId[] }; usedAt?: Date }) => ({
      exec: async () => {
        for (const row of rows) {
          if (!filter._id.$in.some((id) => same(id, row._id))) continue;
          if ('usedAt' in filter && row.usedAt?.getTime() !== filter.usedAt?.getTime()) continue;
          row.usedAt = null;
        }
      },
    })),
  };

  return { service: new AttachmentsService(uploadModel as never), uploadModel };
}

const visitor: AttachmentOwner = {
  kind: 'visitor',
  id: VISITOR_ID,
  siteId: SITE_ID,
  conversationId: CONVERSATION_ID,
};

describe('AttachmentsService.claim', () => {
  it('returns [] for no ids', async () => {
    const h = harness([]);
    await expect(h.service.claim(undefined, visitor)).resolves.toEqual([]);
    await expect(h.service.claim([], visitor)).resolves.toEqual([]);
    expect(h.uploadModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('claims in input order, dedupes, and marks them used', async () => {
    const rows = [upload(), upload(), upload()];
    const h = harness(rows);
    const ids = [rows[2], rows[0], rows[2], rows[1]].map((r) => String(r._id));

    const views = await h.service.claim(ids, visitor);

    expect(views.map((v) => v.id)).toEqual([rows[2], rows[0], rows[1]].map((r) => String(r._id)));
    expect(views[0]).toEqual({
      id: String(rows[2]._id),
      url: rows[2].url,
      mimeType: 'image/png',
      size: 10,
      width: 4,
      height: 3,
      name: 'a.png',
    });
    expect(rows.every((r) => r.usedAt instanceof Date)).toBe(true);
    // Claimable once.
    await expect(h.service.claim([String(rows[0]._id)], visitor)).rejects.toThrow(
      'Ảnh không hợp lệ hoặc đã được dùng.',
    );
  });

  it('rejects more than 5 images', async () => {
    const rows = Array.from({ length: 6 }, () => upload());
    const h = harness(rows);

    await expect(h.service.claim(rows.map((r) => String(r._id)), visitor)).rejects.toThrow(
      'Tối đa 5 ảnh mỗi lần gửi.',
    );
    expect(h.uploadModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an invalid id', async () => {
    const h = harness([]);
    await expect(h.service.claim(['nope'], visitor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects somebody else's upload", async () => {
    const row = upload({ ownerId: new Types.ObjectId() });
    const h = harness([row]);

    await expect(h.service.claim([String(row._id)], visitor)).rejects.toThrow(
      'Ảnh không hợp lệ hoặc đã được dùng.',
    );
    expect(row.usedAt).toBeNull();
  });

  it('rejects an agent claiming a visitor upload with the same id', async () => {
    const row = upload();
    const h = harness([row]);

    await expect(
      h.service.claim([String(row._id)], { kind: 'agent', id: VISITOR_ID, siteId: SITE_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a visitor's upload from another conversation", async () => {
    const row = upload({ conversationId: new Types.ObjectId() });
    const h = harness([row]);

    await expect(h.service.claim([String(row._id)], visitor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(row.usedAt).toBeNull();
  });

  it('rejects a visitor owner without a conversation', async () => {
    const row = upload();
    const h = harness([row]);

    await expect(
      h.service.claim([String(row._id)], { ...visitor, conversationId: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.uploadModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('releases the already-claimed ones when a later id fails', async () => {
    const good = [upload(), upload()];
    const used = upload({ usedAt: new Date() });
    const h = harness([...good, used]);

    await expect(
      h.service.claim([String(good[0]._id), String(good[1]._id), String(used._id)], visitor),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(good.map((r) => r.usedAt)).toEqual([null, null]);
    expect(used.usedAt).toBeInstanceOf(Date);
    expect(h.uploadModel.updateMany).toHaveBeenCalledTimes(1);
  });

  it('claims agent uploads without a conversation filter', async () => {
    const userId = new Types.ObjectId();
    const row = upload({ ownerKind: 'agent', ownerId: userId, conversationId: null });
    const h = harness([row]);

    const views = await h.service.claim([String(row._id)], {
      kind: 'agent',
      id: String(userId),
      siteId: SITE_ID,
    });

    expect(views).toHaveLength(1);
    expect(h.uploadModel.findOneAndUpdate.mock.calls[0][0]).not.toHaveProperty('conversationId');
  });

  it('rejects an upload from another site', async () => {
    const row = upload({ siteId: new Types.ObjectId() });
    const h = harness([row]);

    await expect(h.service.claim([String(row._id)], visitor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AttachmentsService.release', () => {
  it('ignores invalid ids and does nothing for an empty list', async () => {
    const h = harness([]);
    await h.service.release(['x']);
    expect(h.uploadModel.updateMany).not.toHaveBeenCalled();
  });

  it('with a claim stamp, only undoes that exact claim', async () => {
    const row = upload();
    const h = harness([row]);

    const { attachments, claimedAt } = await h.service.claimWithStamp([String(row._id)], visitor);
    expect(attachments).toHaveLength(1);
    expect(row.usedAt).toBe(claimedAt);

    // Somebody else's later claim of the same row must survive a stale release.
    const later = new Date(claimedAt.getTime() + 1000);
    row.usedAt = later;
    await h.service.release([String(row._id)], claimedAt);
    expect(row.usedAt).toBe(later);

    row.usedAt = claimedAt;
    await h.service.release([String(row._id)], claimedAt);
    expect(row.usedAt).toBeNull();
  });
});
