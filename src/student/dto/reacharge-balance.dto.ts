import { IsNumber, IsPositive, Min } from 'class-validator';

export class RechargeBalanceDto {
  @IsNumber({}, { message: 'المبلغ يجب أن يكون رقم' })
  @IsPositive({ message: 'المبلغ يجب أن يكون أكبر من صفر' })
  @Min(10, { message: 'الحد الأدنى للشحن هو 10 جنيه' })
  amount: number;
}
