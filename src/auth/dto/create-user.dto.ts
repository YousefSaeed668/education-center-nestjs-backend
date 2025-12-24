import { Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' })
  @MaxLength(20, { message: 'اسم المستخدم يجب ألا يتجاوز 20 حرف' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'اسم المستخدم يمكن أن يحتوي على حروف وأرقام وشرطة سفلية فقط',
  })
  userName: string;

  @IsPhoneNumber('EG', {
    message: 'رقم الهاتف يجب أن يكون رقم هاتف مصري صالح',
  })
  phoneNumber: string;

  @IsStrongPassword({
    minSymbols: 0,
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'الاسم يجب أن يكون 8 أحرف على الأقل' })
  displayName: string;

  @IsEnum(Gender, { message: 'الجنس يجب أن يكون أحد: ذكر، انثى' })
  gender: Gender;
}

export class CreateTeacherDto extends CreateUserDto {
  @IsInt({ message: 'معرف المادة يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف المادة يجب أن يكون 1 على الأقل' })
  @IsNotEmpty({ message: 'معرف المادة مطلوب' })
  @Type(() => Number)
  subjectId: number;

  @IsArray({ message: 'الشعبة يجب أن تكون مصفوفة من المعرفات' })
  @ArrayNotEmpty({ message: 'يجب اختيار شعبة واحدة على الأقل' })
  @ArrayMinSize(1, { message: 'اختر شعبة واحدة على الأقل' })
  @IsInt({ each: true, message: 'كل معرف صف يجب أن يكون رقم صحيح' })
  @Min(1, { each: true, message: 'كل معرف شعبة يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  divisionIds: number[];

  @IsArray({ message: 'الصف يجب أن يكون مصفوفة من المعرفات' })
  @ArrayNotEmpty({ message: 'يجب اختيار صف واحد على الأقل' })
  @ArrayMinSize(1, { message: 'اختر صف واحد على الأقل' })
  @IsInt({ each: true, message: 'كل معرف صف يجب أن يكون رقم صحيح' })
  @Min(1, { each: true, message: 'كل معرف صف يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  gradeIds: number[];

  @IsInt()
  @Min(1, { message: 'معرف نوع التعليم يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  educationTypeId: number;
}

export class CreateStudentDto extends CreateUserDto {
  @IsInt()
  @Min(1, { message: 'معرف المحافظة يجب أن يكون 1 على الأقل' })
  @IsNotEmpty()
  @Type(() => Number)
  governmentId: number;

  @IsInt()
  @Min(1, { message: 'معرف المدينة يجب أن يكون 1 على الأقل' })
  @IsNotEmpty()
  @Type(() => Number)
  cityId: number;

  @IsInt()
  @Min(1, { message: 'معرف نوع التعليم يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  educationTypeId: number;

  @IsInt()
  @Min(1, { message: 'معرف اللغة الثانية يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  secondLangId: number;

  @IsInt()
  @Min(1, { message: 'معرف نوع المدرسة يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  schoolTypeId: number;

  @IsPhoneNumber('EG')
  parentPhoneNumber: string;

  @IsInt()
  @Min(1, { message: 'معرف الصف يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  gradeId: number;

  @IsInt()
  @Min(1, { message: 'معرف الشعبة يجب أن يكون 1 على الأقل' })
  @Type(() => Number)
  divisionId: number;

  @IsString()
  @IsNotEmpty()
  schoolName: string;
}
