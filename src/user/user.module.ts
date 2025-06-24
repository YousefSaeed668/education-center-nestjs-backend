import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from 'src/prisma.service';
import { CommonModule } from 'src/common/common.module';
import { S3Module } from 'src/s3/s3.module';

@Module({
  controllers: [UserController],
  providers: [UserService, PrismaService],
  imports: [CommonModule, S3Module],
  exports: [UserService],
})
export class UserModule {}
