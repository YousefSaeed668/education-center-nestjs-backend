import { Module } from '@nestjs/common';
import { BookService } from './book.service';
import { BookController } from './book.controller';
import { PrismaService } from 'src/prisma.service';
import { CommonModule } from 'src/common/common.module';
import { S3Module } from 'src/s3/s3.module';

@Module({
  imports: [S3Module, CommonModule],
  controllers: [BookController],
  providers: [BookService, PrismaService],
  exports: [BookService],
})
export class BookModule {}
