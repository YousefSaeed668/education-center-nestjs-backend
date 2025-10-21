import { PaymentSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class AddressDto {
  @IsString({ message: 'اسم المستلم يجب أن يكون نص' })
  @IsNotEmpty({ message: 'اسم المستلم مطلوب' })
  @MinLength(2, { message: 'اسم المستلم يجب أن يكون أكثر من حرفين' })
  @MaxLength(100, { message: 'اسم المستلم يجب أن يكون أقل من 100 حرف' })
  @Transform(({ value }) => value?.trim())
  recipientName: string;

  @IsPhoneNumber('EG', {
    message: 'رقم الهاتف يجب أن يكون رقم هاتف مصري صالح',
  })
  phoneNumber: string;

  @IsString({ message: 'عنوان الشارع يجب أن يكون نص' })
  @IsNotEmpty({ message: 'عنوان الشارع مطلوب' })
  @MinLength(5, { message: 'عنوان الشارع يجب أن يكون أكثر من 5 أحرف' })
  @MaxLength(500, { message: 'عنوان الشارع يجب أن يكون أقل من 500 حرف' })
  @Transform(({ value }) => value?.trim())
  streetAddress: string;

  @IsOptional()
  @IsString({ message: 'الرمز البريدي يجب أن يكون نص' })
  @MaxLength(20, { message: 'الرمز البريدي يجب أن يكون أقل من 20 حرف' })
  @Transform(({ value }) => value?.trim())
  postalCode?: string;

  @IsOptional()
  @IsString({ message: 'الملاحظات الإضافية يجب أن يكون نص' })
  @MaxLength(500, {
    message: 'الملاحظات الإضافية يجب أن تكون أقل من 500 حرف',
  })
  @Transform(({ value }) => value?.trim())
  additionalNotes?: string;

  @IsOptional()
  @IsBoolean({ message: 'العنوان الافتراضي يجب أن يكون صحيح أو خطأ' })
  @Type(() => Boolean)
  isDefault?: boolean;

  @IsInt({ message: 'معرف المحافظة يجب أن يكون رقم صحيح' })
  @IsPositive({ message: 'معرف المحافظة يجب أن يكون رقم موجب' })
  @Type(() => Number)
  governmentId: number;

  @IsInt({ message: 'معرف المدينة يجب أن يكون رقم صحيح' })
  @IsPositive({ message: 'معرف المدينة يجب أن يكون رقم موجب' })
  @Type(() => Number)
  cityId: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsInt({ message: 'معرف العنوان يجب أن يكون رقم صحيح' })
  @IsPositive({ message: 'معرف العنوان يجب أن يكون رقم موجب' })
  @Type(() => Number)
  addressId?: number;

  @IsOptional()
  @Type(() => AddressDto)
  @ValidateNested()
  newAddress?: AddressDto;

  @IsNotEmpty({ message: 'نوع الدفع مطلوب' })
  @IsEnum(PaymentSource, {
    message: 'نوع الدفع يجب أن يكون BALANCE أو CREDIT_CARD',
  })
  paymentSource: PaymentSource;
}
