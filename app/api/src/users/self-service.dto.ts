import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { CannedTemplateDto } from '../canned-responses/canned-responses.dto.js';
import { TRANSLATION_LANGUAGE_CODES } from '../translation/translation.languages.js';

export class UpdateSelfProfileDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(60)
  jobTitle!: string;

  @IsString()
  @MaxLength(2048)
  @Matches(/^$|^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/)
  avatarUrl!: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

export class UpdateOwnPreferencesDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  soundEnabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(4000, { each: true })
  @Matches(/\S/, { each: true })
  cannedResponses?: string[];

  /**
   * The same set with a title and a shortcut per reply. Present in the payload
   * when the editor saved the newer shape; `cannedResponses` above is written
   * alongside it so an older reader keeps working.
   */
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CannedTemplateDto)
  cannedResponseTemplates?: CannedTemplateDto[];

  /** Language code the agent reads and writes in; `''` resets to the default. */
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(8)
  @IsIn([...TRANSLATION_LANGUAGE_CODES, ''], {
    message: 'Ngôn ngữ dịch không được hỗ trợ.',
  })
  translationLanguage?: string;
}
