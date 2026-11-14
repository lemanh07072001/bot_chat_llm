import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class TelegramConfig {
  @Prop({ type: Types.ObjectId, required: true, unique: true }) siteId!: Types.ObjectId;
  @Prop({ default: false }) enabled!: boolean;
  @Prop({ required: true }) encryptedToken!: string;
  @Prop({ required: true }) botId!: string;
  @Prop({ required: true }) revision!: string;
  @Prop({ required: true, unique: true }) chatId!: string;
  @Prop({ type: [{ telegramId: String, userId: String }], default: [] }) responders!: { telegramId: string; userId: string }[];
  @Prop({ type: Types.ObjectId, required: true }) cursor!: Types.ObjectId;
  @Prop({ required: true }) cursorAt!: Date;
  @Prop({ default: '' }) lastError!: string;
}
export const TelegramConfigSchema = SchemaFactory.createForClass(TelegramConfig);

@Schema()
export class TelegramThread {
  @Prop({ required: true }) route!: string;
  @Prop({ required: true }) conversationId!: string;
  @Prop({ required: true }) topicId!: number;
}
export const TelegramThreadSchema = SchemaFactory.createForClass(TelegramThread);
TelegramThreadSchema.index({ route: 1, conversationId: 1 }, { unique: true });

@Schema()
export class TelegramLink {
  @Prop({ required: true }) route!: string;
  @Prop({ required: true }) telegramMessageId!: number;
  @Prop({ required: true }) conversationId!: string;
  @Prop({ required: true }) topicId!: number;
  @Prop({ required: true }) messageId!: string;
  @Prop({ default: 0 }) part!: number;
}
export const TelegramLinkSchema = SchemaFactory.createForClass(TelegramLink);
TelegramLinkSchema.index({ route: 1, telegramMessageId: 1 }, { unique: true });

@Schema()
export class TelegramPollState {
  @Prop({ required: true, unique: true }) botId!: string;
  @Prop({ default: 0 }) offset!: number;
  @Prop({ default: () => new Date(0) }) leaseUntil!: Date;
  @Prop() leaseOwner?: string;
}
export const TelegramPollStateSchema = SchemaFactory.createForClass(TelegramPollState);
