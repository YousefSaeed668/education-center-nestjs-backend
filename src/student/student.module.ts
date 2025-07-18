import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PrismaService } from 'src/prisma.service';
import { UserModule } from 'src/user/user.module';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { S3Module } from 'src/s3/s3.module';
import { PaymobModule } from 'src/paymob/paymob.module';

@Module({
  controllers: [StudentController],
  providers: [StudentService, PrismaService],
  imports: [UserModule, CommonModule, S3Module, PaymobModule],
  exports: [StudentService],
})
export class StudentModule {}
