import { IsNumber, IsPositive, Min } from 'class-validator';

export class RechargeBalanceDto {
  @IsNumber({}, { message: 'المبلغ يجب أن يكون رقم' })
  @IsPositive({ message: 'المبلغ يجب أن يكون أكبر من صفر' })
  @Min(1, { message: 'الحد الأدنى للشحن هو 1 جنيه' })
  amount: number;
}
