import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OtpDocument = HydratedDocument<Otp>;

export type OtpPurpose = 'verify_email' | 'reset_password';

@Schema({ timestamps: true })
export class Otp {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['verify_email', 'reset_password'] })
  purpose!: OtpPurpose;

  @Prop({ required: true })
  codeHash!: string;

  @Prop({ required: true, default: 0 })
  attempts!: number;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
