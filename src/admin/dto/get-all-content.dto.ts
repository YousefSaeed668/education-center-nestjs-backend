import { ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SortOrder } from './get-all-withdraw-requests.dto';

export enum ContentSortBy {
  CREATED_AT = 'createdAt',
  PRICE = 'price',
  NAME = 'name',
  PRODUCT_TYPE = 'productType',
  TEACHER_NAME = 'teacherName',
  EARNINGS = 'earnings',
  PLATFORM_SHARE = 'platformShare',
  SOLD_COUNT = 'soldCount',
}

export class GetAllContentDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsEnum(ContentSortBy)
  sortBy?: ContentSortBy = ContentSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Date)
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  dateTo?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minEarnings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxEarnings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPlatformShare?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPlatformShare?: number;
}

export interface ContentResponse {
  id: number;
  productType: ProductType;
  name: string;
  price: number;
  teacherName: string;
  subject: string;
  grade: string;
  divisions: string[];
  earnings: number;
  platformShare: number;
  soldCount: number;
  createdAt: Date;
}

export interface PaginatedContentsResponse {
  content: ContentResponse[];
  total: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
}
