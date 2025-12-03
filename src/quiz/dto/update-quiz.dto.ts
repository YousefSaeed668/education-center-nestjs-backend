import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ValidateQuestionOptions,
  ValidateQuestions,
} from './validators/question-validation';

export class UpdateQuestionOptionDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  optionText: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  questionText: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuestionOptionDto)
  @ValidateQuestionOptions()
  options: UpdateQuestionOptionDto[];
}

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttempts?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuestionDto)
  @ValidateQuestions()
  questions?: UpdateQuestionDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  deletedQuestionIds?: number[];
}
