import { ProductType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AddReviewDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsEnum(ProductType)
  productType: ProductType;
}
