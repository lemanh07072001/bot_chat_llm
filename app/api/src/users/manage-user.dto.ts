import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AVATAR_URL_MAX_LENGTH, JOB_TITLE_MAX_LENGTH } from './user.schema.js';

/**
 * The two shapes an avatar may take, plus the empty string that clears it.
 * Anything else — javascript:, blob:, an svg data url — is refused, because
 * this value ends up in an <img src> inside a stranger's website.
 */
const AVATAR_URL_PATTERN = /^$|^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/;

/** Mixed into both the create and the update payload. */
class StaffProfileFields {
  @IsOptional()
  @IsString()
  @MaxLength(JOB_TITLE_MAX_LENGTH)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(AVATAR_URL_MAX_LENGTH)
  @Matches(AVATAR_URL_PATTERN, { message: 'avatarUrl không hợp lệ' })
  avatarUrl?: string;
}

export class CreateManagedUserDto extends StaffProfileFields {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsIn(['admin', 'agent'])
  role!: 'admin' | 'agent';
}

export class UpdateManagedUserDto extends StaffProfileFields {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsIn(['admin', 'agent'])
  role!: 'admin' | 'agent';
}
