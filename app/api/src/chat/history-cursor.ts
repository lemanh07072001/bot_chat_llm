import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/** Timestamp plus id makes equal-millisecond rows safe to page. ISO dates remain supported. */
export function encodeCursor(date: Date, id: unknown): string {
  return Buffer.from(JSON.stringify([date.toISOString(), String(id)])).toString(
    'base64url',
  );
}

export function cursorFilter(
  field: string,
  cursor: string | Date,
): Record<string, unknown> {
  if (cursor instanceof Date || /^\d{4}-\d{2}-\d{2}T/.test(cursor)) {
    const date = new Date(cursor);
    if (!Number.isFinite(date.getTime()))
      throw new BadRequestException('Invalid cursor');
    return { [field]: { $lt: date } };
  }
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string' ||
      !Types.ObjectId.isValid(value[1])
    )
      throw new Error();
    const date = new Date(value[0]);
    if (!Number.isFinite(date.getTime())) throw new Error();
    return {
      $or: [
        { [field]: { $lt: date } },
        { [field]: date, _id: { $lt: new Types.ObjectId(value[1]) } },
      ],
    };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
