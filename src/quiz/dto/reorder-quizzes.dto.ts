import { Type } from 'class-transformer';
import { IsArray, IsInt, ValidateNested } from 'class-validator';

export class QuizOrderDto {
  @IsInt()
  id: number;

  @IsInt()
  orderIndex: number;
}

export class ReorderQuizzesDto {
  @IsInt()
  @Type(() => Number)
  lectureId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizOrderDto)
  quizzes: QuizOrderDto[];
}
