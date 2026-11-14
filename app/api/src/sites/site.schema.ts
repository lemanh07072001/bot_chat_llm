import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SiteDocument = HydratedDocument<Site>;

@Schema({ _id: false })
export class WidgetSettings {
  @Prop({ default: '', maxlength: 50000 })
  imageUrl!: string;

  @Prop({ required: true, default: 'Chat với chúng tôi', trim: true, maxlength: 60 })
  title!: string;

  @Prop({ required: true, default: '#0071E3', trim: true })
  themeColor!: string;

  @Prop({
    required: true,
    default: 'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
    trim: true,
    maxlength: 200,
  })
  greeting!: string;
}

export const WidgetSettingsSchema = SchemaFactory.createForClass(WidgetSettings);

/**
 * When somebody is expected to be around. It does not gate anything — a
 * visitor may always write — it decides what the widget tells them to expect,
 * so an out-of-hours message is not left looking ignored.
 */
@Schema({ _id: false })
export class OfficeHours {
  @Prop({ required: true, default: false })
  enabled!: boolean;

  /** IANA zone, so the schedule means the same thing wherever the server runs. */
  @Prop({ required: true, default: 'Asia/Ho_Chi_Minh', trim: true, maxlength: 64 })
  timezone!: string;

  /** 0 = Sunday … 6 = Saturday. Default is Monday to Friday. */
  @Prop({ type: [Number], required: true, default: [1, 2, 3, 4, 5] })
  weekdays!: number[];

  @Prop({ required: true, default: '08:00', trim: true, maxlength: 5 })
  from!: string;

  @Prop({ required: true, default: '17:30', trim: true, maxlength: 5 })
  to!: string;

  @Prop({
    required: true,
    default:
      'Hiện đang ngoài giờ làm việc. Bạn cứ để lại tin nhắn và email, chúng tôi sẽ phản hồi ngay khi mở cửa.',
    trim: true,
    maxlength: 300,
  })
  offlineMessage!: string;
}

export const OfficeHoursSchema = SchemaFactory.createForClass(OfficeHours);

@Schema({ timestamps: true })
export class Site {
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name!: string;

  /**
   * Shipped inside the embed snippet, so it is public by design. It only lets a
   * caller request a visitor session; `allowedOrigins` is the actual gate.
   */
  @Prop({ required: true, unique: true })
  publicKey!: string;

  /** Exact origins (scheme + host + port). Empty means any origin may embed. */
  @Prop({ type: [String], default: [] })
  allowedOrigins!: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: WidgetSettingsSchema, required: true, default: () => ({}) })
  settings!: WidgetSettings;

  @Prop({ type: OfficeHoursSchema, required: true, default: () => ({}) })
  officeHours!: OfficeHours;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const SiteSchema = SchemaFactory.createForClass(Site);

SiteSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v, ownerId, ...rest } = ret;
    return { id: String(_id), ownerId: String(ownerId), ...rest };
  },
});
