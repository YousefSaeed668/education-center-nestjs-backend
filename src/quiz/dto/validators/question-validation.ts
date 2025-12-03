import { QuestionType } from '@prisma/client';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { CreateQuestionDto } from '../create-quiz.dto';

interface QuestionDto {
  type: QuestionType;
  options: Array<{
    isCorrect: boolean;
  }>;
}

interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

@ValidatorConstraint({ name: 'validQuestionStructure', async: false })
export class ValidQuestionStructureConstraint
  implements ValidatorConstraintInterface
{
  private lastValidationResult: ValidationResult = { isValid: true };

  validate(questions: QuestionDto[]): boolean {
    this.lastValidationResult = this.validateQuestions(questions);
    return this.lastValidationResult.isValid;
  }

  defaultMessage(args: ValidationArguments): string {
    return this.lastValidationResult.errorMessage || 'بنية الأسئلة غير صالحة';
  }

  private validateQuestions(questions: QuestionDto[]): ValidationResult {
    if (!Array.isArray(questions)) {
      return {
        isValid: false,
        errorMessage: 'الأسئلة يجب أن تكون مصفوفة صالحة',
      };
    }

    for (const question of questions) {
      if (
        !question.type ||
        !question.options ||
        !Array.isArray(question.options)
      ) {
        return {
          isValid: false,
          errorMessage: 'بنية الأسئلة غير صالحة',
        };
      }

      const validationResult = this.validateQuestionByType(question);
      if (!validationResult.isValid) {
        return validationResult;
      }
    }

    return { isValid: true };
  }

  private validateQuestionByType(question: QuestionDto): ValidationResult {
    const correctOptions = question.options.filter((opt) => opt.isCorrect);

    if (question.type === QuestionType.TRUE_FALSE) {
      if (question.options.length !== 2) {
        return {
          isValid: false,
          errorMessage: 'أسئلة صح/خطأ يجب أن تحتوي على خيارين فقط',
        };
      }

      if (correctOptions.length !== 1) {
        return {
          isValid: false,
          errorMessage: 'أسئلة صح/خطأ يجب أن تحتوي على إجابة صحيحة واحدة فقط',
        };
      }
    } else if (question.type === QuestionType.MULTIPLE_CHOICE) {
      if (question.options.length < 2) {
        return {
          isValid: false,
          errorMessage:
            'الأسئلة متعددة الخيارات يجب أن تحتوي على خيارين على الأقل',
        };
      }

      if (correctOptions.length !== 1) {
        return {
          isValid: false,
          errorMessage:
            'الأسئلة متعددة الخيارات يجب أن تحتوي على إجابة صحيحة واحدة فقط',
        };
      }
    }

    return { isValid: true };
  }
}

export function ValidateQuestions(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ValidQuestionStructureConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'ValidateQuestionOptions', async: false })
class ValidateQuestionOptionsConstraint
  implements ValidatorConstraintInterface
{
  validate(options: any[], args: ValidationArguments) {
    const question = args.object as CreateQuestionDto;

    if (!Array.isArray(options)) {
      return false;
    }

    const optionsCount = options.length;

    switch (question.type) {
      case QuestionType.TRUE_FALSE:
        return optionsCount === 2;

      case QuestionType.MULTIPLE_CHOICE:
        return optionsCount >= 2 && optionsCount <= 6;

      default:
        return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    const question = args.object as CreateQuestionDto;

    switch (question.type) {
      case QuestionType.TRUE_FALSE:
        return 'أسئلة صح/خطأ يجب أن تحتوي على خيارين فقط';

      case QuestionType.MULTIPLE_CHOICE:
        return 'أسئلة الاختيار من متعدد يجب أن تحتوي على 2-6 خيارات';

      default:
        return 'عدد الخيارات غير صالح';
    }
  }
}

export function ValidateQuestionOptions(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ValidateQuestionOptionsConstraint,
    });
  };
}
