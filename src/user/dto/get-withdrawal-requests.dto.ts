import { PaymentMethod, WithdrawStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { SortOrder } from 'src/lecture/dto/get-teacher-lectures.dto';

export enum WithdrawRequestSortBy {
  DATE = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status',

  ACCOUNT_HOLDER_NAME = 'accountHolderName',
  paymentMethod = 'paymentMethod',
}

export class GetWithdrawRequestsDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsEnum(WithdrawRequestSortBy)
  sortBy?: WithdrawRequestSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsOptional()
  @IsEnum(WithdrawStatus)
  status?: WithdrawStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxAmount?: number;
}
