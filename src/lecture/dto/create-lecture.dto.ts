import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class LectureContentDto {
  @IsString()
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

  @IsString()
  @IsNotEmpty({ message: 'مفتاح S3 مطلوب لكل محتوى محاضرة' })
  s3Key: string;
}

export class CreateLectureDto {
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  isSellable: boolean;

  @ValidateIf((o) => o.isSellable === true)
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  price: number;

  @ValidateIf((o) => o.isSellable === true)
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0, { message: 'يجب أن يكون ترتيب المحتوى 0 أو أكثر' })
  orderIndex: number;

  @ValidateIf((o) => o.isSellable === true)
  @IsString()
  @MaxLength(500, { message: 'وصف المحاضرة يجب أن لا يتجاوز 500 حرف' })
  description: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  @Min(1)
  gradeId: number;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
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
  divisionIds: number[];

  @IsString()
  @MinLength(10, {
    message: 'اسم المحاضرة يجب أن يكون 10 أحرف على الأقل',
  })
  @MaxLength(150, {
    message: 'اسم المحاضرة يجب أن لا يتجاوز 150 حرف',
  })
  lectureName: string;

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
  @Type(() => LectureContentDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMaxSize(10, {
    message: 'يجب ألا تتجاوز محتويات المحاضرة 10 عناصر',
  })
  lectureContents: LectureContentDto[];

  @ValidateIf((o) => o.isSellable === true)
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
