import { CourseType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
export interface CourseQueryResult {
  courseId: number;
  thumbnail: string;
  courseName: string;
  coursePrice: number;
  teacherName: string;
  subjectName: string;
  numberOfReviews: number;
  avgRating: number;
  numberOfLectures: number;
  numberOfStudents: number;
}
export enum CourseSortBy {
  RATING = 'rating',
  PRICE = 'price',
  STUDENTS_COUNT = 'studentsCount',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetCoursesDto {
  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  teacherId?: number;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  gradeId?: number;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  divisionId?: number;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  subjectId?: number;

  @IsString()
  @IsOptional()
  q?: string;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(CourseSortBy)
  sortBy?: CourseSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number;
}
