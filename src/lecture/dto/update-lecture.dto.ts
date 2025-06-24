import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsInt,
  ValidateNested,
  IsArray,
  IsNumber,
  Min,
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
}

export class UpdateLectureDto {
  @IsOptional()
  @IsString()
  lectureName?: string;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  gradeId?: number;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  divisionId?: number;

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
