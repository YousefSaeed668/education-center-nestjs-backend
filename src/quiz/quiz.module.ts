import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({
  controllers: [QuizController],
  providers: [QuizService, PrismaService],
  exports: [QuizService],
})
export class QuizModule {}
