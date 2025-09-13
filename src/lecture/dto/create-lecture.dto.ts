import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsString,
  MaxLength,
  Min,
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
  @Min(1)
  orderIndex: number;
}

export class CreateLectureDto {
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isSellable: boolean;

  @ValidateIf((o) => o.isSellable === true)
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  @Min(0)
  price: number;

  @ValidateIf((o) => o.isSellable === true)
  @IsNumber()
  @Min(1)
  subjectId: number;

  @ValidateIf((o) => o.isSellable === true)
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  @Min(1)
  orderIndex: number;

  @ValidateIf((o) => o.isSellable === true)
  @IsString()
  @MaxLength(500)
  description: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  gradeId: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  divisionId: number;

  @IsString()
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
