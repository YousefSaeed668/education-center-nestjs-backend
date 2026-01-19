import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsBoolean()
  teacherRegistration: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.05)
  @Max(1.0)
  platformPercentage: number;

  @IsNumber()
  @Min(0)
  minimumWithdrawAmount: number;

  @IsNumber()
  @Min(0)
  minimumRechargeAmount: number;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' })
  @MaxLength(30, { message: 'اسم المستخدم يجب ألا يتجاوز 30 حرف' })
  displayName?: string;

  @IsOptional()
  @IsPhoneNumber('EG')
  phoneNumber?: string;

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
}
