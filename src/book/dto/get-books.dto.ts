import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import {
  DivisionInfo,
  GradeInfo,
  TeacherRow,
} from 'src/course/dto/get-courses.dto';

export enum BookSortBy {
  RATING = 'rating',
  PRICE = 'price',
  ORDERS_COUNT = 'ordersCount',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetBooksDto {
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
  @IsEnum(BookSortBy)
  sortBy?: BookSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number;
}
export interface BookRow {
  id: number;
  thumbnail: string;
  bookName: string;
  description: string;
  price: number;
  bookFeatures: string[];
  grade: GradeInfo;
  divisions: DivisionInfo[];
  teacher: TeacherRow;
  bookRating: number;
  ordersCount: number;
}
export interface RelatedBook {
  id: number;
  thumbnail: string;
  bookName: string;
  description: string;
  bookFeatures: string[];
  bookPrice: number;
  teacherName: string;
  teacherProfilePicture: string | null;
  teacherId: number;
  gradeName: string;
  subjectName: string | null;
  numberOfReviews: number;
  avgRating: number;
  numberOfOrders: number;
}
