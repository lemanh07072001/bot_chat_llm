import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PushSubscriptionDocument = HydratedDocument<PushSubscription>;

/** The browser's own keys: needed to encrypt a payload for one device. */
export interface PushKeys {
  p256dh: string;
  auth: string;
}

/**
 * One browser/device that agreed to receive pushes.
 *
 * Keyed by `endpoint` rather than by person, because that is what the push
 * service identifies: the same browser re-subscribing (or signing in as
 * somebody else) updates the row instead of leaving a dead one behind.
 */
@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, maxlength: 2048 })
  endpoint!: string;

  @Prop({
    type: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    required: true,
  })
  keys!: PushKeys;

  /** Only for support: tells us which browser a dead row came from. */
  @Prop({ type: String, default: null, maxlength: 300 })
  userAgent?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);

// One row per device endpoint: a re-subscribe updates the owner in place.
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
// Every send looks the person's devices up by owner.
PushSubscriptionSchema.index({ userId: 1 });
