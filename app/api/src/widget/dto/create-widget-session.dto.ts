import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateWidgetSessionDto {
  @IsString()
  @Matches(/^pk_[a-f0-9]{32}$/, { message: 'publicKey is not a valid site key' })
  publicKey!: string;

  /** Returned by a previous session so the visitor reattaches to their history. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  visitorKey?: string;
}
