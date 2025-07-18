import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBookDto {
  @IsString()
  @MinLength(3, {
    message: 'اسم الكتاب يجب ان يكون علي الاقل 3 احرف ',
  })
  bookName: string;
  @IsString()
  @MinLength(100, {
    message: 'وصف الكتاب يجب ان يكون علي الاقل 100 حرف',
  })
  description: string;
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  gradeId: number;
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  divisionId: number;

  @IsNumber()
  @Min(0, {
    message: 'سعر الكتاب يجب ان يكون اكبر من او يساوي 0',
  })
  @Transform(({ value }) => parseFloat(value))
  price: number;
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (error) {
        throw new BadRequestException(
          'bookFeatures must be a valid JSON array',
        );
      }
    }

    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  bookFeatures: string[];
}
