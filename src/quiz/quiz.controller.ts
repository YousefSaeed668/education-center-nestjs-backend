import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { GetQuizzesDto } from './dto/get-quizzes.dto';
import { ReorderQuizzesDto } from './dto/reorder-quizzes.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizService } from './quiz.service';

@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Roles(Role.TEACHER)
  @Post('create')
  createQuiz(@Req() req, @Body() createQuizDto: CreateQuizDto) {
    return this.quizService.createQuiz(req.user.id, createQuizDto);
  }

  @Roles(Role.TEACHER)
  @Get('all')
  getQuizzes(@Req() req, @Query() query: GetQuizzesDto) {
    return this.quizService.getQuizzes(req.user.id, query);
  }

  @Roles(Role.TEACHER)
  @Put(':quizId')
  updateQuiz(
    @Req() req,
    @Param('quizId', ParseIntPipe) quizId: number,
    @Body() updateQuizDto: UpdateQuizDto,
  ) {
    return this.quizService.updateQuiz(req.user.id, quizId, updateQuizDto);
  }
  @Roles(Role.TEACHER)
  @Put('reorder/lecture')
  reorderQuizzes(@Req() req, @Body() reorderDto: ReorderQuizzesDto) {
    return this.quizService.reorderQuizzes(req.user.id, reorderDto);
  }
  @Roles(Role.TEACHER)
  @Delete(':quizId')
  deleteQuiz(@Req() req, @Param('quizId', ParseIntPipe) quizId: number) {
    return this.quizService.deleteQuiz(req.user.id, quizId);
  }

  @Roles(Role.TEACHER)
  @Get(':quizId')
  getQuizByIdTeacher(
    @Req() req,
    @Param('quizId', ParseIntPipe) quizId: number,
  ) {
    return this.quizService.getQuizById(req.user.id, quizId, req.user.role);
  }

  @Roles(Role.STUDENT)
  @Get(':courseId/:quizId')
  getQuizByIdStudent(
    @Req() req,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Param('quizId', ParseIntPipe) quizId: number,
  ) {
    return this.quizService.getQuizById(
      req.user.id,
      quizId,
      req.user.role,
      courseId,
    );
  }

  @Roles(Role.STUDENT)
  @Post(':courseId/:quizId/submit')
  submitQuiz(
    @Req() req,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Param('quizId', ParseIntPipe) quizId: number,
    @Body() submitQuizDto: SubmitQuizDto,
  ) {
    return this.quizService.submitQuiz(
      req.user.id,
      quizId,
      courseId,
      submitQuizDto,
    );
  }
  @Roles(Role.TEACHER)
  @Get('lecture/:lectureId')
  getQuizzesByLecture(
    @Req() req,
    @Param('lectureId', ParseIntPipe) lectureId: number,
  ) {
    return this.quizService.getQuizzesByLecture(req.user.id, lectureId);
  }
}
