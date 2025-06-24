import { Module } from '@nestjs/common';

import { S3Module } from 'src/s3/s3.module';
import { PrismaService } from 'src/prisma.service';
import { CommonModule } from 'src/common/common.module';
import { LectureController } from './lecture.controller';
import { LectureService } from './lecture.service';

@Module({
  imports: [S3Module, CommonModule],
  controllers: [LectureController],
  providers: [LectureService, PrismaService],
  exports: [LectureService],
})
export class LectureModule {}
