import { BadRequestException } from '@nestjs/common';
import { cursorFilter, encodeCursor } from './history-cursor.js';

describe('history cursor', () => {
  const date = new Date('2026-01-01T00:00:00.000Z');
  const id = '507f1f77bcf86cd799430001';
  it('uses the id to include same-millisecond older rows', () => {
    const filter = cursorFilter('createdAt', encodeCursor(date, id)) as {
      $or: Record<string, unknown>[];
    };
    expect(filter.$or[0]).toEqual({ createdAt: { $lt: date } });
    expect(filter.$or[1].createdAt).toEqual(date);
    expect(String((filter.$or[1]._id as { $lt: unknown }).$lt)).toBe(id);
  });
  it('accepts the legacy date cursor', () => {
    expect(cursorFilter('lastMessageAt', date.toISOString())).toEqual({
      lastMessageAt: { $lt: date },
    });
  });
  it('rejects invalid, forged and malformed cursors', () => {
    for (const value of [
      'garbage',
      '2026-99-99T00:00:00Z',
      Buffer.from('["bad","bad"]').toString('base64url'),
    ]) {
      expect(() => cursorFilter('createdAt', value)).toThrow(
        BadRequestException,
      );
    }
  });
});
