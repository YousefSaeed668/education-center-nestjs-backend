import { Module } from '@nestjs/common';
import { PaymobService } from './paymob.service';
import { PaymobController } from './paymob.controller';
import { AdminModule } from 'src/admin/admin.module';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [PaymobController],
  providers: [PaymobService, PrismaService],
  exports: [PaymobService],
  imports: [AdminModule],
})
export class PaymobModule {}
