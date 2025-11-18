import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum LecturesSortBy {
  CREATED_AT = 'createdAt',
  LECTURE_NAME = 'lectureName',
  LECTURE_CONTENT = 'lectureContent',
  QUIZ = 'quiz',
  COURSE_LECTURE = 'courseLecture',
}

export class GetTeacherLecturesDto {
  @IsOptional()
  @IsEnum(LecturesSortBy)
  sortBy?: LecturesSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  pageNumber?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(['true', 'false'])
  hasQuiz?: 'true' | 'false';

  @IsOptional()
  @IsEnum(['true', 'false'])
  usedInCourses?: 'true' | 'false';
}
