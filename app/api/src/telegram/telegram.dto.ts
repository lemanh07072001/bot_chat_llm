import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsMongoId, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export class TelegramResponderDto {
  @IsString() @Matches(/^[1-9]\d{0,15}$/) telegramId!: string;
  @IsMongoId() userId!: string;
}
export class SaveTelegramDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^\d{5,20}:[A-Za-z0-9_-]{20,150}$/) botToken?: string;
  @IsString() @Matches(/^-100\d{5,16}$/) chatId!: string;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TelegramResponderDto)
  responders!: TelegramResponderDto[];
}
