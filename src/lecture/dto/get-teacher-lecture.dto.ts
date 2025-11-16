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
export enum LectureFilterBy {
  HAS_CONTENT = 'hasContent',
  NO_CONTENT = 'noContent',
  HAS_QUIZ = 'hasQuiz',
  NO_QUIZ = 'noQuiz',
  USED_IN_COURSES = 'usedInCourses',
  NOT_USED_IN_COURSES = 'notUsedInCourses',
  ALL = 'all',
}
export class GetTeacherLectureDto {
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
  @IsEnum(LectureFilterBy)
  filterBy?: LectureFilterBy;
  @IsOptional()
  @IsString()
  q?: string;
}
