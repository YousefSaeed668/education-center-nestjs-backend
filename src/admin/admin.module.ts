import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaService } from 'src/prisma.service';
import { UserModule } from 'src/user/user.module';

@Module({
  controllers: [AdminController],
  exports: [AdminService],
  providers: [AdminService, PrismaService],
  imports: [UserModule],
})
export class AdminModule {}
