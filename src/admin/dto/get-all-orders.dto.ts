import { PaymentSource, ProductType, Status } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { SortOrder } from './get-all-withdraw-requests.dto';

export enum OrderSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  TOTAL_AMOUNT = 'totalAmount',
  NUMBER_OF_ITEMS = 'numberOfItems',
  STATUS = 'status',
  STUDENT_NAME = 'studentName',
  PAYMENT_METHOD = 'paymentMethod',
}

export enum ProductTypeFilter {
  COURSE_ONLY = 'courseOnly',
  BOOK_ONLY = 'bookOnly',
  MIXED = 'mixed',
}

export class GetAllOrdersDto {
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
  @IsEnum(OrderSortBy)
  sortBy?: OrderSortBy = OrderSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

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

  @IsOptional()
  @IsEnum(PaymentSource)
  paymentSource?: PaymentSource;

  @IsOptional()
  @IsEnum(ProductTypeFilter)
  productType?: ProductTypeFilter;
}

export interface OrderItemResponse {
  id: number;
  name: string;
  type: ProductType;
  price: number;
}

export interface ShippingAddressResponse {
  recipientName: string;
  phoneNumber: string;
  streetAddress: string;
  postalCode: string | null;
  additionalNotes: string | null;
  governmentName: string;
  cityName: string;
}

export interface OrderResponse {
  id: number;
  studentName: string;
  studentPhone: string;
  totalAmount: number;
  status: string;
  numberOfItems: number;
  orderItems: OrderItemResponse[];
  paymentMethod: string | null;
  shippingAddress: ShippingAddressResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedOrdersResponse {
  orders: OrderResponse[];
  total: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
}
