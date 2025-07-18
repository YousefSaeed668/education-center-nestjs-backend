import { ProductType } from '@prisma/client';

export enum PaymentPurpose {
  CART_ORDER = 'CART_ORDER',
  DIRECT_PURCHASE = 'DIRECT_PURCHASE',
  BALANCE_TOPUP = 'BALANCE_TOPUP',
}

export interface PaymentContext {
  purpose: PaymentPurpose;
  studentId: number;
  metadata?: {
    productId?: number;
    productType?: ProductType;
    cartId?: number;
    [key: string]: any;
  };
}

export interface IPaymob {
  authenticate(): Promise<string>;
  registerOrder(token: string, amount: number, items: any[]): Promise<number>;
  generatePaymentKey(
    token: string,
    order_id: number,
    user: any,
    amount: number,
    paymentContext: PaymentContext,
  ): Promise<string>;
  createPayment(
    user: any,
    amount: number,
    items: any[],
    paymentContext: PaymentContext,
  ): Promise<PaymobCreatedPayment>;
}
