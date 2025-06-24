import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { UserModule } from 'src/user/user.module';
import { TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';
import { S3Module } from 'src/s3/s3.module';

@Module({
  controllers: [TeacherController],
  providers: [TeacherService, PrismaService],
  imports: [UserModule, S3Module],
})
export class TeacherModule {}
