import { CourseType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum StudentCourseSortBy {
  COURSE_NAME = 'courseName',
  TEACHER_NAME = 'teacherName',
  COURSE_TYPE = 'courseType',
  PRICE = 'price',
  PURCHASE_DATE = 'purchaseDate',
  EXPIRATION_DATE = 'expirationDate',
  STATUS = 'status',
}

export class GetStudentCoursesDto {
  @IsOptional()
  @IsEnum(StudentCourseSortBy)
  sortBy?: StudentCourseSortBy;

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
  minPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;
}

export interface StudentCourseQueryResult {
  id: number;
  courseName: string;
  courseType: CourseType;
  price: number;
  purchaseDate: Date;
  expirationDate: Date | null;
  status: boolean;
  teacherName: string;
}
