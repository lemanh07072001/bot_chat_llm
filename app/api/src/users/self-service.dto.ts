import { ArrayMaxSize, IsArray, IsBoolean, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

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
}
