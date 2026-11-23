import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { Upload, UploadDocument } from './upload.schema.js';

/** Uploads never attached within this long are abandoned. */
export const UNCLAIMED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const CLEANUP_BATCH_SIZE = 100;
/** Bounds one sweep; whatever is left waits for the next tick. */
const MAX_BATCHES_PER_SWEEP = 50;
const TICK_MS = 60 * 60 * 1000;

/**
 * `usedAt` while a row is being cleaned up. Any non-null value already stops
 * `claim` (it only takes `usedAt: null`), so a sweep can never delete an image
 * a message is attaching at the same moment. A crash mid-sweep leaves the
 * marker behind; the next sweep picks those rows up again.
 */
export const CLEANUP_MARKER = new Date(0);

/**
 * API only: deletes uploads nobody attached within a day, object and row.
 * Lives outside the files the realtime service copies, so it never runs there.
 */
@Injectable()
export class AttachmentsCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentsCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    private readonly storage: AttachmentStorageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;

    this.timer = setInterval(() => {
      void this.sweep();
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One sweep; returns how many uploads were removed. Never throws. */
  async sweep(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    const cutoff = new Date(now.getTime() - UNCLAIMED_UPLOAD_TTL_MS);
    let removed = 0;
    let after: Types.ObjectId | null = null;

    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch++) {
        const rows: Array<{ _id: Types.ObjectId; key: string }> = await this.uploadModel
          .find({
            usedAt: { $in: [null, CLEANUP_MARKER] },
            createdAt: { $lt: cutoff },
            ...(after ? { _id: { $gt: after } } : {}),
          })
          .sort({ _id: 1 })
          .limit(CLEANUP_BATCH_SIZE)
          .select({ _id: 1, key: 1 })
          .lean<Array<{ _id: Types.ObjectId; key: string }>>()
          .exec();

        for (const row of rows) {
          if (await this.remove(row)) removed++;
        }

        if (rows.length < CLEANUP_BATCH_SIZE) break;
        after = rows[rows.length - 1]._id;
      }
    } catch (error) {
      this.logger.warn(
        `Upload cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }

    if (removed > 0) this.logger.log(`Removed ${removed} unclaimed upload(s).`);
    return removed;
  }

  private async remove(row: { _id: Types.ObjectId; key: string }): Promise<boolean> {
    // Take the row away from `claim` first; skip it if a message just took it.
    const reserved = await this.uploadModel
      .findOneAndUpdate(
        { _id: row._id, usedAt: { $in: [null, CLEANUP_MARKER] } },
        { $set: { usedAt: CLEANUP_MARKER } },
      )
      .exec();

    if (!reserved) return false;

    if (!(await this.storage.delete(row.key).catch(() => false))) {
      // The object is still there: hand the row back, a later sweep retries.
      await this.uploadModel
        .updateOne({ _id: row._id, usedAt: CLEANUP_MARKER }, { $set: { usedAt: null } })
        .exec();
      return false;
    }

    await this.uploadModel.deleteOne({ _id: row._id, usedAt: CLEANUP_MARKER }).exec();
    return true;
  }
}
