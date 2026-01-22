import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BookModule } from './book/book.module';
import { CartModule } from './cart/cart.module';
import { CommentModule } from './comment/comment.module';
import { CommonModule } from './common/common.module';
import { CourseModule } from './course/course.module';
import { GuardianModule } from './guardian/guardian.module';
import { LectureModule } from './lecture/lecture.module';
import { LookupModule } from './lookup/lookup.module';
import { OrderModule } from './order/order.module';
import { PaymobModule } from './paymob/paymob.module';
import { QuizModule } from './quiz/quiz.module';
import { ReviewModule } from './review/review.module';
import { S3Module } from './s3/s3.module';
import { StudentModule } from './student/student.module';
import { TeacherModule } from './teacher/teacher.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),
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
    LookupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
