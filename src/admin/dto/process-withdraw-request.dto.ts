import { WithdrawStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ProcessWithdrawRequestDto {
  @IsEnum(WithdrawStatus, { message: 'حالة الطلب غير صحيحة' })
  status: WithdrawStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'ملاحظات الإدارة يجب ألا تتجاوز 500 حرف' })
  adminNotes?: string;
}
