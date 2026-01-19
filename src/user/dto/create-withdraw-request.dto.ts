import { PaymentMethod } from '@prisma/client';

import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWithdrawRequestDto {
  @IsString()
  @MinLength(8, {
    message: 'اسم صاحب الحساب يجب أن يكون على الأقل 8 أحرف',
  })
  @MaxLength(50, {
    message: 'اسم صاحب الحساب يجب أن لا يتجاوز 50 حرفًا',
  })
  accountHolderName: string;

  @IsString()
  @MaxLength(500, {
    message: 'الملاحظات يجب أن لا تتجاوز 500 حرفًا',
  })
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(0, {
    message: 'المبلغ يجب ان يكون اكبر من 0',
  })
  amount: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
  @IsPhoneNumber('EG')
  phoneNumber: string;
}
