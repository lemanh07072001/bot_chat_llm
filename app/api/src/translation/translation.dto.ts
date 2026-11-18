import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  TRANSLATION_LANGUAGE_CODES,
  type TranslationLanguage,
} from './translation.languages.js';

export class TranslateTextDto {
  @IsString()
  @Matches(/\S/, { message: 'Không có nội dung để dịch.' })
  @MaxLength(4000)
  text!: string;

  @IsIn(TRANSLATION_LANGUAGE_CODES, {
    message: 'Ngôn ngữ đích không được hỗ trợ.',
  })
  target!: TranslationLanguage;

  @IsOptional()
  @IsIn(TRANSLATION_LANGUAGE_CODES)
  source?: TranslationLanguage;
}

/** The bubble's endpoint: same target, but the message id comes from the path. */
export class TranslateMessageDto {
  @IsOptional()
  @IsIn(TRANSLATION_LANGUAGE_CODES, {
    message: 'Ngôn ngữ đích không được hỗ trợ.',
  })
  target?: TranslationLanguage;
}
