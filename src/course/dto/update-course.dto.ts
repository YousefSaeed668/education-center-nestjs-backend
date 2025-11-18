import { CourseType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  courseName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  gradeId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) {
      return value.map((v: any) => parseInt(v));
    }
    return value;
  })
  @IsArray({
    message: 'يجب ان تكون قائمة المعرفات صحيحة',
  })
  @IsInt({ each: true, message: 'يجب ان يكون كل معرف رقم صحيح' })
  @Min(1, { each: true, message: 'يجب ان يكون كل معرف رقم صحيح اكبر من صفر' })
  divisionIds?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, {
    each: true,
    message: 'يجب ان لا يزيد طول الميزة عن 100 حرف',
  })
  @MinLength(3, { each: true, message: 'يجب ان لا يقل طول الميزة عن 3 حروف' })
  courseFeatures?: string[];
}
