import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { CartModule } from 'src/cart/cart.module';
import { PrismaService } from 'src/prisma.service';
import { PaymobModule } from 'src/paymob/paymob.module';

@Module({
  controllers: [OrderController],
  providers: [OrderService, PrismaService],
  imports: [CartModule, PaymobModule],
  exports: [OrderService],
})
export class OrderModule {}
