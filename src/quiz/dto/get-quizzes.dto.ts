import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SortOrder } from 'src/teacher/dto/get-teachers.dto';

export enum QuizSortBy {
  CREATED_AT = 'createdAt',
  TITLE = 'title',
  LECTURE_NAME = 'lectureName',
  QUESTIONS_COUNT = 'questionsCount',
  ATTEMPTS_COUNT = 'attemptsCount',
}

export class GetQuizzesDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsEnum(QuizSortBy)
  sortBy?: QuizSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lectureId?: number;
}
