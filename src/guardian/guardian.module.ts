import { Module } from '@nestjs/common';
import { CartModule } from 'src/cart/cart.module';
import { OrderModule } from 'src/order/order.module';
import { PrismaService } from 'src/prisma.service';
import { S3Module } from 'src/s3/s3.module';
import { StudentModule } from 'src/student/student.module';
import { UserModule } from 'src/user/user.module';
import { GuardianController } from './guardian.controller';
import { GuardianService } from './guardian.service';

@Module({
  controllers: [GuardianController],
  providers: [GuardianService, PrismaService],
  imports: [StudentModule, CartModule, OrderModule, S3Module, UserModule],
})
export class GuardianModule {}
