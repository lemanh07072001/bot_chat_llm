import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CANNED_MODES,
  CANNED_SHORTCUT_MAX_LENGTH,
  CANNED_TEXT_MAX_LENGTH,
  CANNED_TITLE_MAX_LENGTH,
  type CannedMode,
} from '../sites/site.schema.js';

/** Blank is allowed: most replies do not need a shortcut. */
const SHORTCUT_PATTERN = /^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CannedTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(CANNED_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CANNED_SHORTCUT_MAX_LENGTH)
  @Matches(SHORTCUT_PATTERN, {
    message: 'shortcut chỉ gồm chữ thường, số và dấu gạch nối, ví dụ chao-hoi',
  })
  shortcut?: string;

  @IsString()
  @Matches(/\S/, { message: 'Nội dung mẫu câu không được để trống.' })
  @MaxLength(CANNED_TEXT_MAX_LENGTH)
  text!: string;
}

export class UpdateCannedSetDto {
  /** The version the editor loaded; the write is refused when it has moved. */
  @IsInt()
  @Min(0)
  version!: number;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CannedTemplateDto)
  templates!: CannedTemplateDto[];
}

export class UpdateSiteCannedSetDto extends UpdateCannedSetDto {
  @IsOptional()
  @IsIn(CANNED_MODES)
  mode?: CannedMode;
}
