import {
  PaymentMethod,
  WithdrawStatus,
  WithdrawUserType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum WithdrawSortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status',
  USER_TYPE = 'userType',
  DISPLAY_NAME = 'displayName',
  USERNAME = 'username',
  PAYMENT_METHOD = 'paymentMethod',
  ACCOUNT_HOLDER_NAME = 'accountHolderName',
  BALANCE = 'balance',
  PROCESSED_BY_NAME = 'processedByName',
  PROCESSED_AT = 'processedAt',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetAllWithdrawRequestsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsEnum(WithdrawSortBy)
  sortBy?: WithdrawSortBy = WithdrawSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(WithdrawStatus)
  status?: WithdrawStatus;

  @IsOptional()
  @IsEnum(WithdrawUserType)
  userType?: WithdrawUserType;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @Type(() => Date)
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  dateTo?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;
}

export interface WithdrawRequestResponse {
  id: number;
  createdAt: Date;
  status: WithdrawStatus;
  displayName: string;
  notes: string | null;
  userName: string;
  userType: WithdrawUserType;
  amount: number;
  paymentMethod: PaymentMethod;
  phoneNumber: string;
  accountHolderName: string;
  userBalance: number;
  processedByName: string | null;
  processedAt: Date | null;
}

export interface PaginatedWithdrawResponse {
  withdrawRequests: WithdrawRequestResponse[];
  total: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
}
