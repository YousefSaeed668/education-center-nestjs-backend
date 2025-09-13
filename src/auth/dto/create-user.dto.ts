import { Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  Matches,
  MaxLength,
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
  @IsNotEmpty({ message: 'معرف المادة مطلوب' })
  @Type(() => Number)
  subjectId: number;

  @IsArray({ message: 'الشعبة يجب أن تكون مصفوفة من المعرفات' })
  @ArrayNotEmpty({ message: 'يجب اختيار شعبة واحدة على الأقل' })
  @ArrayMinSize(1, { message: 'اختر شعبة واحدة على الأقل' })
  @IsInt({ each: true, message: 'كل معرف صف يجب أن يكون رقم صحيح' })
  @Type(() => Number)
  divisionIds: number[];

  @IsArray({ message: 'الصف يجب أن يكون مصفوفة من المعرفات' })
  @ArrayNotEmpty({ message: 'يجب اختيار صف واحد على الأقل' })
  @ArrayMinSize(1, { message: 'اختر صف واحد على الأقل' })
  @IsInt({ each: true, message: 'كل معرف صف يجب أن يكون رقم صحيح' })
  @Type(() => Number)
  gradeIds: number[];

  @IsInt()
  @Type(() => Number)
  educationTypeId: number;
}

export class CreateStudentDto extends CreateUserDto {
  @IsInt()
  @IsNotEmpty()
  governmentId: number;

  @IsInt()
  @IsNotEmpty()
  cityId: number;

  @IsNumber()
  educationTypeId: number;

  @IsInt()
  secondLangId: number;

  @IsInt()
  schoolTypeId: number;

  @IsPhoneNumber('EG')
  parentPhoneNumber: string;

  @IsInt()
  gradeId: number;

  @IsInt()
  divisionId: number;

  @IsString()
  @IsNotEmpty()
  schoolName: string;
}
