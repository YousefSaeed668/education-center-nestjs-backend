import { CourseType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum TeacherCourseSortBy {
  COURSE_NAME = 'courseName',
  PRICE = 'price',
  NUMBER_OF_STUDENTS = 'numberOfStudents',
  NUMBER_OF_LECTURES = 'numberOfLectures',
  AVG_RATING = 'avgRating',
  CREATED_AT = 'createdAt',
  TOTAL_REVENUE = 'totalRevenue',
}

export class GetTeacherCoursesDto {
  @IsOptional()
  @IsEnum(TeacherCourseSortBy)
  sortBy?: TeacherCourseSortBy;

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

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minStudents?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxStudents?: number;

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

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minRating?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxRating?: number;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;
}

export interface TeacherCourseQueryResult {
  id: number;
  courseName: string;
  courseType: CourseType;
  price: number;
  avgRating: number;
  createdAt: Date;
  totalRevenue: number;
  grade: {
    id: number;
    name: string;
  };
  division: Array<{
    id: number;
    name: string;
  }>;
  _count: {
    Students: number;
    Lectures: number;
  };
}
