import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { sendNotification, setVapidDetails, type PushSubscription as WebPushSubscription } from 'web-push';
import { RedisBridgeService } from '../realtime/redis-bridge.service.js';
import {
  PushSubscription,
  type PushSubscriptionDocument,
} from './push-subscription.schema.js';

/** The JSON the service worker receives. Mirrors the wire contract. */
export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  /** Collapses notifications for one conversation on the device. */
  tag?: string;
  data?: { url: string };
}

/** A push is only worth holding for an hour; the bell has the real record. */
const PUSH_TTL_SECONDS = 3600;

/**
 * Web Push for closed tabs.
 *
 * Best effort by design: the bell row is the source of truth, and this only
 * tries to make a phone buzz. Every failure is logged and swallowed, because a
 * push endpoint that is down must never fail the visitor's message.
 *
 * With no VAPID keys configured the service disables itself once at startup
 * instead of pretending each send failed.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey: string | null;

  constructor(
    @InjectModel(PushSubscription.name)
    private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    config: ConfigService,
    private readonly presence: RedisBridgeService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY')?.trim() || null;
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY')?.trim() || null;
    const subject = config.get<string>('VAPID_SUBJECT')?.trim() || null;

    if (!publicKey || !privateKey || !subject) {
      // Constructor runs once per process, so this warning is naturally once.
      this.logger.warn(
        'Web Push disabled: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set.',
      );
      this.vapidPublicKey = null;
      return;
    }

    setVapidDetails(subject, publicKey, privateKey);
    this.vapidPublicKey = publicKey;
  }

  /** The key the browser subscribes with; null when push is off. */
  publicKey(): string | null {
    return this.vapidPublicKey;
  }

  /**
   * Stores a device for the current user. Subscribing twice from the same
   * browser (or from a browser where somebody else just signed in) moves the
   * row to the current user rather than leaving a stale owner behind.
   */
  async subscribe(
    userId: string,
    dto: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent: string | null,
  ): Promise<void> {
    await this.subscriptionModel
      .updateOne(
        { endpoint: dto.endpoint },
        {
          $set: {
            userId,
            keys: { p256dh: dto.keys.p256dh, auth: dto.keys.auth },
            userAgent,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /** Removes only the caller's own row: an endpoint is a capability. */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionModel.deleteOne({ userId, endpoint }).exec();
  }

  /**
   * Rings every device this person owns, but only when we are *sure* they have
   * no socket open anywhere. Unknown presence (Redis down) is not "offline" —
   * a wrong guess here means a phone buzzing for a tab that is already open.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      if (!this.vapidPublicKey) {
        return;
      }

      const connected = await this.presence.isUserConnected(userId);

      if (connected !== false) {
        return;
      }

      const subscriptions = await this.subscriptionModel
        .find({ userId })
        .exec();

      if (subscriptions.length === 0) {
        return;
      }

      const body = JSON.stringify(payload);

      await Promise.all(
        subscriptions.map((subscription) =>
          this.sendOne(subscription, body),
        ),
      );
    } catch (error: unknown) {
      // Never let delivery break the caller: the bell already exists.
      this.logger.warn(`Push not sent to ${userId}: ${describe(error)}`);
    }
  }

  private async sendOne(
    subscription: PushSubscriptionDocument,
    body: string,
  ): Promise<void> {
    const target: WebPushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    try {
      await sendNotification(target, body, {
        TTL: PUSH_TTL_SECONDS,
        urgency: 'high',
      });
    } catch (error: unknown) {
      const statusCode = statusOf(error);

      // 404/410 is the push service saying "this browser is gone": keeping the
      // row only costs a failing request on every future send.
      if (statusCode === 404 || statusCode === 410) {
        await this.subscriptionModel
          .deleteOne({ endpoint: subscription.endpoint })
          .exec()
          .catch(() => undefined);
        return;
      }

      this.logger.warn(
        `Push rejected for ${subscription.endpoint.slice(0, 64)}…: ${describe(error)}`,
      );
    }
  }
}

function statusOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    return typeof value === 'number' ? value : null;
  }

  return null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
