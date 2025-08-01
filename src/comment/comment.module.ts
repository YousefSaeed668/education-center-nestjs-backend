import { Module } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { PrismaService } from 'src/prisma.service';
import { S3Module } from 'src/s3/s3.module';

@Module({
  controllers: [CommentController],
  providers: [CommentService, PrismaService],
  imports: [S3Module],
})
export class CommentModule {}
