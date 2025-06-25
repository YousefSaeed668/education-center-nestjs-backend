import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductType } from '@prisma/client';

export class CartParamsDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  itemId: number;

  @IsEnum(ProductType)
  productType: ProductType;
}

export class UpdateQuantityDto {
  @IsInt()
  @Min(0)
  @Max(99)
  quantity: number;
}
