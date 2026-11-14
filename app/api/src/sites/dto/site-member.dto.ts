import { IsMongoId } from 'class-validator';

export class AddSiteMemberDto {
  /** An existing staff account; members are granted, never invited by email. */
  @IsMongoId()
  userId!: string;
}
