import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum BooksSortBy {
  CREATED_AT = 'createdAt',
  BOOK_NAME = 'bookName',
  PRICE = 'price',
  TOTAL_REVENUE = 'totalRevenue',
}

export class GetTeacherBooksDto {
  @IsOptional()
  @IsEnum(BooksSortBy)
  sortBy?: BooksSortBy;

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
}
