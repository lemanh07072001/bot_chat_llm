import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Rejects entries carrying a path or trailing slash, which could never match a browser Origin header. */
const ORIGIN_PATTERN = /^https?:\/\/[^/\s]+$/;

export class WidgetSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  @Matches(/^(?:https?:\/\/[^\s]+|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})?$/, { message: 'Image must be an HTTP(S) URL or a PNG, JPEG, WebP data image' })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'themeColor must be a hex colour such as #2563eb' })
  themeColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  greeting?: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class OfficeHoursDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /**
   * Checked against the runtime's own zone database rather than a list, so a
   * schedule can never be saved in a zone the server cannot evaluate.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9+_\-/]+$/, { message: 'timezone must be an IANA zone such as Asia/Ho_Chi_Minh' })
  timezone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'from must look like 08:00' })
  from?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'to must look like 17:30' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  offlineMessage?: string;
}

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(ORIGIN_PATTERN, {
    each: true,
    message: 'allowedOrigins entries must look like https://example.com',
  })
  allowedOrigins?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WidgetSettingsDto)
  settings?: WidgetSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OfficeHoursDto)
  officeHours?: OfficeHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TranslationSettingsDto)
  translation?: TranslationSettingsDto;
}

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(ORIGIN_PATTERN, {
    each: true,
    message: 'allowedOrigins entries must look like https://example.com',
  })
  allowedOrigins?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WidgetSettingsDto)
  settings?: WidgetSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OfficeHoursDto)
  officeHours?: OfficeHoursDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
