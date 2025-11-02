import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class UpdateLectureContentDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseInt(value);
      return isNaN(parsed) ? value : parsed;
    }
    return typeof value === 'number' ? value : parseInt(value);
  })
  @IsInt()
  id?: number;

  @IsString()
  @IsNotEmpty({ message: 'اسم المحتوى مطلوب' })
  contentName: string;

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseInt(value);
      return isNaN(parsed) ? value : parsed;
    }
    return typeof value === 'number' ? value : parseInt(value);
  })
  @IsNumber()
  @Min(0)
  orderIndex: number;

  @ValidateIf((o) => !o.id)
  @IsString()
  @IsNotEmpty({ message: 'مفتاح S3 مطلوب للمحتوى الجديد' })
  s3Key: string;
}

export class UpdateLectureDto {
  @IsOptional()
  @IsString()
  lectureName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  gradeId?: number;

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
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  divisionIds?: number[];

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateLectureContentDto)
  lectureContents?: UpdateLectureContentDto[];

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  deletedContentIds?: number[];
}
