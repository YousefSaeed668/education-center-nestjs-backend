import { Module } from '@nestjs/common';
import { BookModule } from 'src/book/book.module';
import { CourseModule } from 'src/course/course.module';
import { PrismaService } from 'src/prisma.service';
import { UserModule } from 'src/user/user.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  exports: [AdminService],
  providers: [AdminService, PrismaService],
  imports: [UserModule, CourseModule, BookModule],
})
export class AdminModule {}
