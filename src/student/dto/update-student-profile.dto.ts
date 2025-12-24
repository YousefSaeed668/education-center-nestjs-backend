import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateStudentProfileDto {
  @IsOptional()
  @IsPhoneNumber('EG')
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' })
  @MaxLength(30, { message: 'اسم المستخدم يجب ألا يتجاوز 30 حرف' })
  displayName?: string;

  @IsOptional()
  @ValidateIf(
    (o) => o.password !== undefined && o.password !== null && o.password !== '',
  )
  @IsStrongPassword(
    {
      minSymbols: 0,
    },
    {
      message:
        'الباسورد يجب ان يحتوى على 8 احرف على الاقل و 1 حرف كبير و 1 حرف صغير ورقم',
    },
  )
  password?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'معرف المحافظة يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف المحافظة يجب أن يكون أكبر من صفر' })
  governmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'معرف المدينة يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف المدينة يجب أن يكون أكبر من صفر' })
  cityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'معرف نوع التعليم يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف نوع التعليم يجب أن يكون أكبر من صفر' })
  educationTypeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'معرف اللغة الثانية يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف اللغة الثانية يجب أن يكون أكبر من صفر' })
  secondLangId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'معرف نوع المدرسة يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف نوع المدرسة يجب أن يكون أكبر من صفر' })
  schoolTypeId?: number;

  @IsOptional()
  @IsPhoneNumber('EG')
  parentPhoneNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'معرف الصف يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف الصف يجب أن يكون أكبر من صفر' })
  gradeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'معرف الشعبة يجب أن يكون رقم صحيح' })
  @Min(1, { message: 'معرف الشعبة يجب أن يكون أكبر من صفر' })
  divisionId?: number;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'اسم المدرسة يجب أن يكون حرفين على الأقل' })
  @MaxLength(100, { message: 'اسم المدرسة يجب ألا يتجاوز 100 حرف' })
  schoolName?: string;
}
