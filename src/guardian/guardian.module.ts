import { Module } from '@nestjs/common';
import { GuardianService } from './guardian.service';
import { PrismaService } from 'src/prisma.service';
import { StudentModule } from 'src/student/student.module';
import { CartModule } from 'src/cart/cart.module';
import { OrderModule } from 'src/order/order.module';
import { GuardianController } from './guardian.controller';

@Module({
  controllers: [GuardianController],
  providers: [GuardianService, PrismaService],
  imports: [StudentModule, CartModule, OrderModule],
})
export class GuardianModule {}
