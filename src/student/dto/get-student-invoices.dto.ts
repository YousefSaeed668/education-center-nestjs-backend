import { PaymentSource, Status } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum InvoiceSortBy {
  INVOICE_DATE = 'invoiceDate',
  TOTAL_AMOUNT = 'totalAmount',
  STATUS = 'status',
  PAYMENT_SOURCE = 'paymentSource',
  PRODUCTS_COUNT = 'productsCount',
}

export class GetStudentInvoicesDto {
  @IsOptional()
  @IsEnum(InvoiceSortBy, { message: 'نوع الترتيب غير صالح' })
  sortBy?: InvoiceSortBy;

  @IsOptional()
  @IsEnum(SortOrder, { message: 'اتجاه الترتيب غير صالح' })
  sortOrder?: SortOrder;

  @IsNumber({}, { message: 'رقم الصفحة يجب أن يكون رقماً' })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'رقم الصفحة يجب أن يكون 1 على الأقل' })
  pageNumber?: number;

  @IsNumber({}, { message: 'حجم الصفحة يجب أن يكون رقماً' })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'حجم الصفحة يجب أن يكون 1 على الأقل' })
  pageSize?: number;

  @IsNumber({}, { message: 'الحد الأدنى للمبلغ يجب أن يكون رقماً' })
  @Min(0, { message: 'الحد الأدنى للمبلغ يجب أن يكون 0 على الأقل' })
  @IsOptional()
  @Type(() => Number)
  minAmount?: number;

  @IsNumber({}, { message: 'الحد الأقصى للمبلغ يجب أن يكون رقماً' })
  @Min(0, { message: 'الحد الأقصى للمبلغ يجب أن يكون 0 على الأقل' })
  @IsOptional()
  @Type(() => Number)
  maxAmount?: number;

  @IsOptional()
  @IsEnum(PaymentSource, { message: 'طريقة الدفع غير صالحة' })
  paymentSource?: PaymentSource;

  @IsOptional()
  @IsEnum(Status, { message: 'حالة الفاتورة غير صالحة' })
  status?: Status;

  @IsNumber({}, { message: 'الحد الأدنى لعدد المنتجات يجب أن يكون رقماً' })
  @Min(1, { message: 'الحد الأدنى لعدد المنتجات يجب أن يكون 1 على الأقل' })
  @IsOptional()
  @Type(() => Number)
  minProducts?: number;

  @IsNumber({}, { message: 'الحد الأقصى لعدد المنتجات يجب أن يكون رقماً' })
  @Min(1, { message: 'الحد الأقصى لعدد المنتجات يجب أن يكون 1 على الأقل' })
  @IsOptional()
  @Type(() => Number)
  maxProducts?: number;
}
export interface InvoiceProduct {
  name: string;
  type: string;
  price: number;
}

export interface StudentInvoiceQueryResult {
  invoiceNumber: number;
  invoiceDate: Date;
  productsCount: number;
  products: InvoiceProduct[];
  totalAmount: number;
  status: Status;
  paymentSource: PaymentSource | null;
}
