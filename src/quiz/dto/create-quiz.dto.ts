import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { QuestionType } from '@prisma/client';
import { ValidateQuestions } from './validators/question-validation';

export class CreateQuestionOptionDto {
  @IsString()
  optionText: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @IsString()
  questionText: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  options: CreateQuestionOptionDto[];
}

export class CreateQuizDto {
  @IsString()
  @MinLength(8, {
    message: 'اسم الاختبار يجب ان يكون علي الاقل 8 احرف',
  })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  lectureId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  @ValidateQuestions()
  questions: CreateQuestionDto[];
}
