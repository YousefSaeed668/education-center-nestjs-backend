import { Module } from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { TeacherController } from './teacher.controller';
import { S3Module } from 'src/s3/s3.module';
import { PrismaService } from 'src/prisma.service';
import { CommonModule } from 'src/common/common.module';

@Module({
  controllers: [TeacherController],
  providers: [TeacherService, PrismaService],
  imports: [S3Module, CommonModule],
})
export class TeacherModule {}
