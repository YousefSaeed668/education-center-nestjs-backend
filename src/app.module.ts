import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { TeacherModule } from './teacher/teacher.module';
import { S3Module } from './s3/s3.module';
import { CommonModule } from './common/common.module';
import { CourseModule } from './course/course.module';
import { LectureModule } from './lecture/lecture.module';
import { StudentModule } from './student/student.module';
import { CartModule } from './cart/cart.module';
import { PaymobModule } from './paymob/paymob.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OrderModule } from './order/order.module';
import { BookModule } from './book/book.module';
import { AdminModule } from './admin/admin.module';
import { GuardianModule } from './guardian/guardian.module';
import { QuizModule } from './quiz/quiz.module';
import { CommentModule } from './comment/comment.module';
import { ReviewModule } from './review/review.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    UserModule,
    AuthModule,
    TeacherModule,
    S3Module,
    CommonModule,
    CourseModule,
    LectureModule,
    StudentModule,
    CartModule,
    PaymobModule,
    OrderModule,
    BookModule,
    AdminModule,
    GuardianModule,
    QuizModule,
    CommentModule,
    ReviewModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
