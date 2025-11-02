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
} from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  courseName?: string;
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  subjectId?: number;

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
    return Array.isArray(value) ? value.map((v: any) => parseInt(v)) : [];
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  divisionIds?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  courseFeatures?: string[];
}
