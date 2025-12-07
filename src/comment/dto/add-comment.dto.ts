import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddCommentDto {
  @IsString({ message: 'يجب أن يكون النص نصًا صالحًا' })
  text: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  parentCommentId?: number;
}
