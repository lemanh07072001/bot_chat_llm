import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SiteMemberDocument = HydratedDocument<SiteMember>;

/**
 * Only `manager` is stored. A site's owner is whoever created it
 * (`Site.ownerId`), which is deliberately *not* duplicated here: it keeps
 * ownership in one place and means existing sites needed no backfill when
 * membership was introduced.
 */
export type SiteMemberRole = 'manager';

@Schema({ timestamps: true })
export class SiteMember {
  @Prop({ type: Types.ObjectId, ref: 'Site', required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['manager'], default: 'manager' })
  role!: SiteMemberRole;

  /** Who granted the access, for an audit trail. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  addedBy!: Types.ObjectId;
}

export const SiteMemberSchema = SchemaFactory.createForClass(SiteMember);

// One membership row per person per site.
SiteMemberSchema.index({ siteId: 1, userId: 1 }, { unique: true });
// "Which projects may this person open?" — asked on every inbox load.
SiteMemberSchema.index({ userId: 1 });

SiteMemberSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v, siteId, userId, addedBy, ...rest } = ret;
    return {
      id: String(_id),
      siteId: String(siteId),
      userId: String(userId),
      addedBy: String(addedBy),
      ...rest,
    };
  },
});
