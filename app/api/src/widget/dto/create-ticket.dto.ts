import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_ATTACHMENTS } from '../../attachments/attachment.types.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** What the widget's "leave a request" form sends when nobody can answer now. */
export class CreateTicketDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  name?: string;

  @Transform(trim)
  @IsEmail({}, { message: 'email không hợp lệ' })
  @MaxLength(200)
  email!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  @MaxLength(2000)
  message!: string;

  /** Images uploaded first via POST /widget/uploads. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS, { message: 'Tối đa 5 ảnh mỗi lần gửi.' })
  @IsMongoId({ each: true, message: 'Ảnh không hợp lệ hoặc đã được dùng.' })
  attachmentIds?: string[];
}
