import { Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export interface TeacherQueryResult {
  teacherId: number;
  profilePicture: string | null;
  displayName: string;
  subjectName: string;
  bio: string | null;
  avgRating: number;
  numberOfCourses: number;
  numberOfBooks: number;
  numberOfStudents: number;
  gender: Gender;
}

export enum TeacherSortBy {
  DISPLAY_NAME = 'displayName',
  COURSES_COUNT = 'coursesCount',
  BOOKS_COUNT = 'booksCount',
  STUDENTS_COUNT = 'studentsCount',
  RATING = 'rating',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetTeachersDto {
  @IsString()
  @IsOptional()
  q?: string;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  gradeId?: number;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  subjectId?: number;

  @IsOptional()
  @IsEnum(TeacherSortBy)
  sortBy?: TeacherSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number;
}
