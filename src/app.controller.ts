import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { PaymobService } from './paymob/paymob.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly paymobService: PaymobService,
  ) {}
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  // @Public()
  // @Post('/paymob/credit-card')
  // getIframeCreditCardUrl() {
  //   const fakeUser = {
  //     email: 'test@example.com',
  //     phone: '01012345678',
  //     firstName: 'Youssef',
  //     lastName: 'Saeed',
  //     address: {
  //       apartment: '5A',
  //       floor: '2',
  //       building: '23B',
  //       street: 'Tahrir Street',
  //       city: 'Cairo',
  //       country: 'EG',
  //       state: 'Cairo',
  //       zip_code: '12345',
  //     },
  //   };
  //   const fakeAmount = 100;
  //   return this.paymobService.getPaymentKey(fakeUser, fakeAmount, []);
  // }
}
