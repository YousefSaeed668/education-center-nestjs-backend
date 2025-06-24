import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { S3Module } from 'src/s3/s3.module';
import { PrismaService } from 'src/prisma.service';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [S3Module, CommonModule],
  controllers: [CourseController],
  providers: [CourseService, PrismaService],
})
export class CourseModule {}
