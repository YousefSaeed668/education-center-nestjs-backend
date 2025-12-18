import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ValidateQuestionOptions,
  ValidateQuestions,
} from './validators/question-validation';

export class CreateQuestionOptionDto {
  @IsString()
  optionText: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @IsString()
  @MinLength(8, {
    message: 'السؤال يجب ان يكون علي الاقل 8 احرف',
  })
  questionText: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  @ValidateQuestionOptions()
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
  @MaxLength(255, {
    message: 'وصف الاختبار يجب ان يكون علي الاقل 255 حرف',
  })
  description?: string;

  @Type(() => Number)
  @IsInt()
  lectureId: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'وقت الاختبار يجب ان يكون علي الاقل دقيقه واحدة' })
  @Max(180, { message: 'وقت الاختبار يجب ان يكون علي الاكثر 180 دقيقه' })
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'عدد المحاولات يجب ان يكون علي الاقل 1' })
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
