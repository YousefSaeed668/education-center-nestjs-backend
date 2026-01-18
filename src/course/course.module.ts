import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PrismaService } from 'src/prisma.service';
import { S3Module } from 'src/s3/s3.module';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';

@Module({
  imports: [S3Module, CommonModule],
  controllers: [CourseController],
  providers: [CourseService, PrismaService],
  exports: [CourseService],
})
export class CourseModule {}
