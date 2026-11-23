import { IsOptional, IsBoolean, IsString, Matches, MaxLength } from 'class-validator';

export class CreateWidgetSessionDto {
  @IsString()
  @Matches(/^pk_[a-f0-9]{32}$/, { message: 'publicKey is not a valid site key' })
  publicKey!: string;

  /** Returned by a previous session so the visitor reattaches to their history. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  visitorKey?: string;

  /**
   * "Reattach me or tell me there is nothing." With this set, a missing or
   * unknown `visitorKey` answers `{ resumed: false }` and creates no visitor and
   * no conversation, so a widget can poll it without minting rows.
   */
  @IsOptional()
  @IsBoolean()
  resumeOnly?: boolean;
}
