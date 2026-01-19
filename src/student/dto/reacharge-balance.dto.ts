import { IsNumber, IsPositive, Min } from 'class-validator';

export class RechargeBalanceDto {
  @IsNumber({}, { message: 'المبلغ يجب أن يكون رقم' })
  @IsPositive({ message: 'المبلغ يجب أن يكون أكبر من صفر' })
  @Min(0, { message: 'يجب ان يكون المبلغ اكبر من 0' })
  amount: number;
}
