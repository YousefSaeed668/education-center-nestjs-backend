import { CourseType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
@ValidatorConstraint()
export class IsAfterNowConstraint implements ValidatorConstraintInterface {
  validate(date: Date) {
    return Date.now() < date.getTime();
  }

  defaultMessage(args: ValidationArguments) {
    return `Date ${args.property} can not before now.`;
  }
}

function IsAfterNow(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsAfterNowConstraint,
    });
  };
}
export class CreateCourseDto {
  @IsString()
  courseName: string;

  @IsInt()
  @Min(1, { each: true })
  @Transform(({ value }) => parseInt(value))
  subjectId: number;
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Transform(({ value }) => {
    return Array.isArray(value) ? value.map((v: any) => parseInt(v)) : [];
  })
  lectureIds: number[];

  @IsDate()
  @Transform(({ value }) => new Date(value))
  @IsAfterNow({ message: 'تاريخ الانتهاء يجب ان يكون فى المستقبل' })
  expiresAt: Date;

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
