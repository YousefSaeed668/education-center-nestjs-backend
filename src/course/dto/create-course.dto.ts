import { CourseType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  courseName: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Transform(({ value }) => {
    return Array.isArray(value) ? value.map((v: any) => parseInt(v)) : [];
  })
  lectureIds: number[];

  @IsString()
  description: string;

  @IsEnum(CourseType)
  @Transform(({ value }) => value.toUpperCase())
  courseType: CourseType;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  price: number;

  @Transform(({ value }) => parseInt(value))
  @IsInt()
  gradeId: number;

  @Transform(({ value }) => parseInt(value))
  @IsInt()
  divisionId: number;

  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  courseFeatures: string[];
}
