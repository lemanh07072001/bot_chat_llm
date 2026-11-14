import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VisitorDocument = HydratedDocument<Visitor>;

@Schema({ timestamps: true })
export class Visitor {
  @Prop({ type: Types.ObjectId, ref: 'Site', required: true })
  siteId!: Types.ObjectId;

  /**
   * Opaque id the widget keeps in the browser so a returning visitor reattaches
   * to their history. Always looked up together with `siteId`, so a key lifted
   * from one site cannot be replayed against another.
   */
  @Prop({ required: true })
  visitorKey!: string;

  @Prop({ trim: true, maxlength: 100 })
  name?: string;

  @Prop({ trim: true, lowercase: true, maxlength: 200 })
  email?: string;

  @Prop({ maxlength: 400 })
  userAgent?: string;

  @Prop({ default: Date.now })
  lastSeenAt!: Date;
}

export const VisitorSchema = SchemaFactory.createForClass(Visitor);

VisitorSchema.index({ siteId: 1, visitorKey: 1 }, { unique: true });

VisitorSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v, siteId, visitorKey: _visitorKey, ...rest } = ret;
    return { id: String(_id), siteId: String(siteId), ...rest };
  },
});
