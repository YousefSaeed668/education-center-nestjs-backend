import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { IPaymob, PaymentContext, PaymentPurpose } from './IPaymob';

@Injectable()
export class PaymobService implements IPaymob {
  integrationId: string;
  public frameId: string;
  public apiUrl: string = 'https://accept.paymobsolutions.com/api';
  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.frameId = this.configService.get<string>('PAYMOB_FRAME_ID')!;
    this.integrationId = this.configService.get<string>(
      'PAYMOB_CREDIT_CARD_INTEGRATION_ID',
    )!;
  }
  async authenticate(): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/auth/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.configService.get<string>('PAYMOB_API_KEY'),
        }),
      });
      const data = await response.json();
      return data.token;
    } catch (error) {
      throw new Error(error);
    }
  }

  async registerOrder(
    token: string,
    amount: number,
    items: any[],
  ): Promise<number> {
    const response = await fetch(`${this.apiUrl}/ecommerce/orders`, {
      method: 'POST',
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: false,
        amount_cents: amount * 100,
        currency: 'EGP',
        items,
      }),
    });
    const data = await response.json();
    return data.id;
  }

  async generatePaymentKey(
    token: string,
    order_id: number,
    user: any,
    amount: number,
    paymentContext: PaymentContext,
  ): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/acceptance/payment_keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_token: token,
          amount_cents: amount * 100,
          expiration: 3600,
          order_id,
          currency: 'EGP',

          billing_data: {
            email: user.email || 'NA',
            phone_number: user.phone,
            apartment: user.address ? user.address.apartment : 'NA',
            floor: user.address ? user.address.floor : 'NA',
            building: user.address ? user.address.building : 'NA',
            street: user.address ? user.address.street : 'NA',
            city: user.address ? user.address.city : 'NA',
            country: user.address ? user.address.country : 'NA',
            first_name: user.firstName,
            last_name: user.lastName,
            state: user.address ? user.address.state : 'NA',
            zip_code: user.address ? user.address.zip_code : 'NA',
            extra_description: JSON.stringify(paymentContext),
          },
          integration_id: this.integrationId,
          lock_order_when_paid: 'false',
        }),
      });
      const data = await response.json();
      return data.token;
    } catch (error) {
      throw new Error(`Error generating payment key: ${error}`);
    }
  }
  async createPayment(
    user: any,
    amount: number,
    items: any[] = [],
    paymentContext: PaymentContext,
  ): Promise<PaymobCreatedPayment> {
    const token = await this.authenticate();
    const orderId = await this.registerOrder(token, amount, items);
    const paymentToken = await this.generatePaymentKey(
      token,
      orderId,
      user,
      amount,
      paymentContext,
    );
    return {
      orderId: orderId,
      token: paymentToken,
    };
  }

  async getPaymentKey(
    user: any,
    amount: number,
    items: any[] = [],
    paymentContext: PaymentContext,
  ): Promise<PaymobPayload> {
    const { orderId, token } = await this.createPayment(
      user,
      amount,
      items,
      paymentContext,
    );
    return {
      paymentId: orderId,
      data: `https://accept.paymobsolutions.com/api/acceptance/iframes/${this.frameId}?payment_token=${token}`,
    };
  }

  compareHMAC(callbackData: any, hmac: string) {
    const keyOrder = [
      'amount_cents',
      'created_at',
      'currency',
      'error_occured',
      'has_parent_transaction',
      'obj.id',
      'integration_id',
      'is_3d_secure',
      'is_auth',
      'is_capture',
      'is_refunded',
      'is_standalone_payment',
      'is_voided',
      'order.id',
      'owner',
      'pending',
      'source_data.pan',
      'source_data.sub_type',
      'source_data.type',
      'success',
    ];

    function getNestedValue(obj: any, path: string) {
      return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
      }, obj);
    }

    const values: string[] = [];

    for (const key of keyOrder) {
      let value: any;

      if (key.startsWith('obj.')) {
        const nestedKey = key.substring(4);
        value = getNestedValue(callbackData.obj, nestedKey);
      } else {
        value = getNestedValue(callbackData.obj, key);
      }

      if (value === null || value === undefined) {
        values.push('');
      } else if (typeof value === 'boolean') {
        values.push(value.toString());
      } else {
        values.push(String(value));
      }
    }

    const secretKey = this.configService.get<string>('HMAC');
    if (!secretKey) {
      throw new Error('HMAC secret key is not configured');
    }
    const hmacHash = crypto
      .createHmac('sha512', secretKey)
      .update(values.join(''))
      .digest('hex');
    if (hmacHash !== hmac) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }
    return {
      success: 'true',
    };
  }

  handlePaymobWebhook(payload: any, hmac: string) {
    const compareResult = this.compareHMAC(payload, hmac);
    if (compareResult.success !== 'true') {
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    if (payload && payload.obj && payload.obj.success === true) {
      const orderId = payload.obj.order.id;
      const transactionId = payload.obj.id;
      const amountCents = payload.obj.amount_cents;
      const paymentContextWebhook =
        payload.obj.order.shipping_data.extra_description ||
        payload.obj.payment_key_claims.billing_data.extra_description;
      let paymentContext: PaymentContext | null = null;
      if (paymentContextWebhook) {
        try {
          paymentContext = JSON.parse(paymentContextWebhook);
        } catch (e) {
          console.error(
            'Failed to parse payment context from shipping_data',
            e,
          );
        }
      }
      if (!paymentContext) {
        console.warn(
          'Payment context is null or undefined, using default context',
        );

        return;
      }
      this.handleSuccessfulPayment(
        orderId,
        transactionId,
        amountCents,
        paymentContext,
      );
    } else {
      const orderId = payload.obj.order.id;
      const transactionId = payload.obj.id;
      const message = payload.obj.message;
      this.handleFailedPayment(orderId, transactionId, message);
    }

    return { status: 'success' };
  }
  handleSuccessfulPayment(
    orderId: number,
    transactionId: number,
    amountCents: number,
    paymentContext?: PaymentContext,
  ) {
    switch (paymentContext?.purpose) {
      case PaymentPurpose.CART_ORDER:
        this.eventEmitter.emit('payment.cart-order.success', {
          orderId,
          transactionId,
          amountCents,
          studentId: paymentContext.studentId,
          metadata: paymentContext.metadata,
        });
        break;
      case PaymentPurpose.DIRECT_PURCHASE:
        this.eventEmitter.emit('payment.direct-purchase.success', {
          orderId,
          transactionId,
          amountCents,
          studentId: paymentContext.studentId,
          metadata: paymentContext.metadata,
        });
        break;
      case PaymentPurpose.BALANCE_TOPUP:
        this.eventEmitter.emit('payment.balance-topup.success', {
          orderId,
          transactionId,
          amountCents,
          studentId: paymentContext.studentId,
          metadata: paymentContext.metadata,
        });
        break;
      default:
        this.eventEmitter.emit('payment.success', {
          orderId,
          transactionId,
          amountCents,
          paymentContext,
        });
    }
  }
  handleFailedPayment(orderId: number, transactionId: string, message: string) {
    this.eventEmitter.emit('payment.failed', {
      orderId,
      transactionId,
      message,
    });
  }
}
