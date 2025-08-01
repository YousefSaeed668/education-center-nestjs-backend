import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddCommentDto {
  @IsString()
  text: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  parentCommentId?: number;
}
