import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  async createQuiz(teacherId: number, createQuizDto: CreateQuizDto) {
    const {
      lectureId,
      title,
      description,
      maxAttempts,
      orderIndex,
      questions,
    } = createQuizDto;

    const lecture = await this.prisma.lecture.findFirst({
      where: {
        id: lectureId,
        teacherId: teacherId,
      },
    });

    if (!lecture) {
      throw new NotFoundException(
        'المحاضرة غير موجودة أو ليس لديك صلاحية للوصول إليها',
      );
    }

    const existingQuiz = await this.prisma.quiz.findFirst({
      where: {
        lectureId,
        orderIndex,
      },
    });

    if (existingQuiz) {
      throw new BadRequestException(
        'ترتيب الاختبار مستخدم بالفعل في هذه المحاضرة',
      );
    }

    return await this.prisma.$transaction(async (prisma) => {
      const quiz = await prisma.quiz.create({
        data: {
          title,
          description,
          lectureId,
          teacherId,
          maxAttempts,
          orderIndex,
        },
      });
      for (const questionData of questions) {
        const question = await prisma.quizQuestion.create({
          data: {
            quizId: quiz.id,
            questionText: questionData.questionText,
            type: questionData.type,
            orderIndex: questionData.orderIndex,
          },
        });

        await prisma.quizQuestionOption.createMany({
          data: questionData.options.map((option) => ({
            questionId: question.id,
            optionText: option.optionText,
            isCorrect: option.isCorrect,
          })),
        });
      }

      return await prisma.quiz.findUnique({
        where: { id: quiz.id },
        include: {
          questions: {
            include: {
              options: true,
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    });
  }

  async updateQuiz(
    teacherId: number,
    quizId: number,
    updateQuizDto: UpdateQuizDto,
  ) {
    const existingQuiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        teacherId: teacherId,
      },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
      },
    });
    if (!existingQuiz) {
      throw new NotFoundException(
        'الاختبار غير موجود أو ليس لديك صلاحية لتعديله',
      );
    }

    const {
      title,
      description,
      maxAttempts,
      orderIndex,
      questions,
      deletedQuestionIds,
    } = updateQuizDto;

    if (orderIndex && orderIndex !== existingQuiz.orderIndex) {
      const conflictingQuiz = await this.prisma.quiz.findFirst({
        where: {
          lectureId: existingQuiz.lectureId,
          orderIndex,
          id: { not: quizId },
        },
      });

      if (conflictingQuiz) {
        throw new BadRequestException(
          'ترتيب الاختبار مستخدم بالفعل في هذه المحاضرة',
        );
      }
    }

    if (questions) {
      const orderIndexes = questions.map((q) => q.orderIndex);
      const uniqueOrderIndexes = new Set(orderIndexes);
      if (orderIndexes.length !== uniqueOrderIndexes.size) {
        throw new BadRequestException(
          'ترتيب الأسئلة يجب أن يكون فريداً داخل الاختبار',
        );
      }
    }

    return await this.prisma.$transaction(async (prisma) => {
      await prisma.quiz.update({
        where: { id: quizId },
        data: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(maxAttempts !== undefined && { maxAttempts }),
          ...(orderIndex && { orderIndex }),
        },
      });

      if (deletedQuestionIds && deletedQuestionIds.length > 0) {
        await prisma.quizQuestion.deleteMany({
          where: {
            id: { in: deletedQuestionIds },
            quizId,
          },
        });
      }

      if (questions && questions.length > 0) {
        await prisma.quizQuestion.deleteMany({
          where: { quizId },
        });

        for (const questionData of questions) {
          const newQuestion = await prisma.quizQuestion.create({
            data: {
              quizId,
              questionText: questionData.questionText,
              type: questionData.type,
              orderIndex: questionData.orderIndex,
            },
          });

          await prisma.quizQuestionOption.createMany({
            data: questionData.options.map((option) => ({
              questionId: newQuestion.id,
              optionText: option.optionText,
              isCorrect: option.isCorrect,
            })),
          });
        }
      }

      return await prisma.quiz.findUnique({
        where: { id: quizId },
        include: {
          questions: {
            include: {
              options: true,
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
    });
  }
  async deleteQuiz(teacherId: number, quizId: number) {
    const existingQuiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        teacherId: teacherId,
      },
    });

    if (!existingQuiz) {
      throw new NotFoundException(
        'الاختبار غير موجود أو ليس لديك صلاحية لحذفه',
      );
    }

    await this.prisma.quiz.delete({
      where: { id: quizId },
    });

    return { message: 'تم حذف الاختبار بنجاح' };
  }

  async getQuizById(teacherId: number, quizId: number) {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        teacherId: teacherId,
      },
      include: {
        questions: {
          include: {
            options: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
        lecture: {
          select: {
            id: true,
            lectureName: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException(
        'الاختبار غير موجود أو ليس لديك صلاحية للوصول إليه',
      );
    }

    return quiz;
  }

  async getQuizzesByLecture(teacherId: number, lectureId: number) {
    const lecture = await this.prisma.lecture.findFirst({
      where: {
        id: lectureId,
        teacherId: teacherId,
      },
    });

    if (!lecture) {
      throw new NotFoundException(
        'المحاضرة غير موجودة أو ليس لديك صلاحية للوصول إليها',
      );
    }

    return await this.prisma.quiz.findMany({
      where: {
        lectureId,
        teacherId,
      },
      include: {
        questions: {
          include: {
            options: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: {
            attempts: true,
          },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });
  }
}
