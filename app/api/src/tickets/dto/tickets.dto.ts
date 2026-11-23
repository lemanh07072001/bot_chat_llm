import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TICKET_STATUSES, type TicketStatus } from '../tickets.types.js';
import { MAX_ATTACHMENTS } from '../../attachments/attachment.types.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListTicketsQuery {
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  siteId?: string;

  /** An agent id, or `none` for unassigned tickets (admin only). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class AssignTicketDto {
  /** `null` takes the ticket back from whoever holds it. */
  @ValidateIf((_, value) => value !== null)
  @IsMongoId()
  agentId!: string | null;
}

export class UpdateTicketDto {
  @IsIn(TICKET_STATUSES)
  status!: TicketStatus;
}

/** Text, images, or both — the service rejects a reply with neither. */
export class ReplyTicketDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  body?: string;

  /** Images uploaded first via POST /uploads. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS, { message: 'Tối đa 5 ảnh mỗi lần gửi.' })
  @IsMongoId({ each: true, message: 'Ảnh không hợp lệ hoặc đã được dùng.' })
  attachmentIds?: string[];
}
