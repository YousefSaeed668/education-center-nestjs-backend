import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { PaymobService } from './paymob.service';
@Controller('paymob')
@Public()
export class PaymobController {
  constructor(private readonly paymobService: PaymobService) {}
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handlePaymobWebhook(@Body() payload: any, @Query('hmac') hmac: string) {
    return this.paymobService.handlePaymobWebhook(payload, hmac);
  }
}
