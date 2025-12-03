import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { SortOrder } from 'src/teacher/dto/get-teachers.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { GetQuizzesDto, QuizSortBy } from './dto/get-quizzes.dto';
import { ReorderQuizzesDto } from './dto/reorder-quizzes.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  async createQuiz(teacherId: number, createQuizDto: CreateQuizDto) {
    const { lectureId, title, description, maxAttempts, questions } =
      createQuizDto;

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
    const maxOrderQuiz = await this.prisma.quiz.findFirst({
      where: { lectureId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const orderIndex = maxOrderQuiz ? maxOrderQuiz.orderIndex + 1 : 0;
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
      omit: {
        updatedAt: true,
        createdAt: true,
        teacherId: true,
        isActive: true,
      },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: {
            options: {
              omit: {
                questionId: true,
              },
            },
          },
        },
      },
    });

    if (!existingQuiz) {
      throw new NotFoundException(
        'الاختبار غير موجود أو ليس لديك صلاحية لتعديله',
      );
    }

    const { title, description, maxAttempts, questions, deletedQuestionIds } =
      updateQuizDto;

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

  async reorderQuizzes(teacherId: number, reorderDto: ReorderQuizzesDto) {
    const { lectureId, quizzes } = reorderDto;

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

    const quizIds = quizzes.map((q) => q.id);
    const existingQuizzes = await this.prisma.quiz.findMany({
      where: {
        id: { in: quizIds },
        lectureId,
        teacherId,
      },
    });

    if (existingQuizzes.length !== quizIds.length) {
      throw new BadRequestException(
        'بعض الاختبارات غير موجودة أو لا تنتمي لهذه المحاضرة',
      );
    }

    const orderIndexes = quizzes.map((q) => q.orderIndex);
    const uniqueOrderIndexes = new Set(orderIndexes);
    if (orderIndexes.length !== uniqueOrderIndexes.size) {
      throw new BadRequestException('ترتيب الاختبارات يجب أن يكون فريداً');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const quiz of quizzes) {
        await tx.quiz.update({
          where: { id: quiz.id },
          data: { orderIndex: -quiz.id },
        });
      }

      for (const quiz of quizzes) {
        await tx.quiz.update({
          where: { id: quiz.id },
          data: { orderIndex: quiz.orderIndex },
        });
      }
    });

    return {
      message: 'تم تحديث ترتيب الاختبارات بنجاح',
    };
  }
  async getQuizById(teacherId: number, quizId: number) {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        teacherId: teacherId,
      },
      omit: {
        updatedAt: true,
        createdAt: true,
        teacherId: true,
        isActive: true,
      },
      include: {
        questions: {
          include: {
            options: {
              omit: {
                questionId: true,
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
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

  async getQuizzes(teacherId: number, query: GetQuizzesDto) {
    const {
      pageNumber = 1,
      pageSize = 20,
      sortOrder = SortOrder.DESC,
      q,
      lectureId,
    } = query;

    const take = pageSize;
    const skip = (pageNumber - 1) * take;

    const whereClause: Prisma.QuizWhereInput = {
      teacherId,
      ...(q && {
        title: {
          contains: q,
          mode: 'insensitive',
        },
      }),
      ...(lectureId && {
        lectureId,
      }),
    };

    let orderByClause: Prisma.QuizOrderByWithRelationInput = {};

    if (!query.sortBy && lectureId) {
      orderByClause = { orderIndex: 'asc' };
    } else {
      const sortBy = query.sortBy || QuizSortBy.CREATED_AT;

      switch (sortBy) {
        case QuizSortBy.LECTURE_NAME:
          orderByClause = {
            lecture: {
              lectureName: sortOrder.toLowerCase() as Prisma.SortOrder,
            },
          };
          break;
        case QuizSortBy.QUESTIONS_COUNT:
          orderByClause = {
            questions: {
              _count: sortOrder.toLowerCase() as Prisma.SortOrder,
            },
          };
          break;
        case QuizSortBy.ATTEMPTS_COUNT:
          orderByClause = {
            attempts: {
              _count: sortOrder.toLowerCase() as Prisma.SortOrder,
            },
          };
          break;
        default:
          orderByClause = {
            [sortBy]: sortOrder.toLowerCase() as Prisma.SortOrder,
          };
      }
    }

    const [count, quizzes] = await Promise.all([
      this.prisma.quiz.count({
        where: whereClause,
      }),
      this.prisma.quiz.findMany({
        where: whereClause,
        orderBy: orderByClause,
        include: {
          lecture: {
            select: {
              lectureName: true,
            },
          },
          _count: {
            select: {
              questions: true,
              attempts: true,
            },
          },
        },
        take,
        skip,
      }),
    ]);

    const totalPages = Math.ceil(count / take);

    return {
      quizzes: quizzes.map((quiz) => {
        const q = quiz as any;
        return {
          id: q.id,
          title: q.title,
          lectureName: q.lecture.lectureName,
          questionsCount: q._count.questions,
          attemptsCount: q._count.attempts,
          createdAt: q.createdAt,
        };
      }),
      total: count,
      totalPages,
      pageNumber,
      pageSize: take,
    };
  }
}
