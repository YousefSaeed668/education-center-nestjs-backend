import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentSource, Prisma, WithdrawUserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { HelperFunctionsService } from 'src/common/services/helperfunctions.service';
import { PaymentPurpose } from 'src/paymob/IPaymob';
import { PaymobService } from 'src/paymob/paymob.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateWithdrawRequestDto } from 'src/user/dto/create-withdraw-request.dto';
import { UserService } from 'src/user/user.service';
import {
  GetStudentCoursesDto,
  SortOrder,
  StudentCourseQueryResult,
  StudentCourseSortBy,
} from './dto/get-student-courses.dto';
import {
  GetStudentInvoicesDto,
  InvoiceSortBy,
  SortOrder as InvoiceSortOrder,
  StudentInvoiceQueryResult,
} from './dto/get-student-invoices.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';

@Injectable()
export class StudentService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly paymobService: PaymobService,
  ) {}

  async updateProfile(
    studentId: number,
    body: UpdateStudentProfileDto,
    file?: Express.Multer.File,
  ) {
    let newProfilePictureUrl: string | undefined;
    try {
      if (file) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: studentId },
          select: { profilePicture: true },
        });

        newProfilePictureUrl =
          await this.userService.handleProfilePictureUpdate(
            currentUser?.profilePicture || null,
            file,
            'student/profile-picture',
          );
      }
      const userData = HelperFunctionsService.removeUndefined({
        profilePicture: newProfilePictureUrl,
        displayName: body.displayName,
        phoneNumber: body.phoneNumber,
        password: body.password
          ? await bcrypt.hash(body.password, 10)
          : undefined,
      });

      const studentData = HelperFunctionsService.removeUndefined({
        governmentId: body.governmentId,
        cityId: body.cityId,
        educationTypeId: body.educationTypeId,
        secondLangId: body.secondLangId,
        schoolTypeId: body.schoolTypeId,
        parentPhoneNumber: body.parentPhoneNumber,
        gradeId: body.gradeId,
        divisionId: body.divisionId,
        schoolName: body.schoolName,
      });
      await this.prisma.$transaction(async (tx) => {
        return await tx.user.update({
          where: { id: studentId },
          data: {
            ...userData,
            ...(Object.keys(studentData).length > 0 && {
              student: {
                update: studentData,
              },
            }),
          },
          include: {
            student: true,
          },
        });
      });

      return {
        message: 'تم تحديث الملف الشخصي بنجاح',
      };
    } catch (error) {
      if (newProfilePictureUrl && error) {
        await this.s3Service.deleteFileByUrl(newProfilePictureUrl).catch(() => {
          console.error(
            'Failed to cleanup uploaded file:',
            newProfilePictureUrl,
          );
        });
      }

      throw error;
    }
  }

  async rechargeBalance(studentId: number, amount: number) {
    const student = await this.prisma.student.findUnique({
      where: {
        id: studentId,
      },
      select: {
        id: true,
        user: {
          select: {
            displayName: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('الطالب غير موجود');
    }
    const paymentItem = {
      name: 'شحن الرصيد',
      amount_cents: amount * 100,
      description: `شحن رصيد بقيمة ${amount} جنيه`,
      quantity: 1,
    };

    const user = {
      phone: student.user.phoneNumber,
      firstName: student.user.displayName,
      lastName: student.user.displayName,
    };

    const url = await this.paymobService.getPaymentKey(
      user,
      amount,
      [paymentItem],
      {
        purpose: PaymentPurpose.BALANCE_TOPUP,
        studentId: student.id,
        metadata: {
          amount: amount,
          paymentSource: PaymentSource.CREDIT_CARD,
        },
      },
    );

    return {
      url: url.url,
    };
  }

  @OnEvent('payment.balance-topup.success')
  async handleBalanceTopupSuccess(payload: {
    orderId: number;
    transactionId: number;
    amountCents: number;
    studentId: number;
    metadata: {
      amount: number;
    };
  }) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: payload.studentId },
          data: {
            balance: {
              increment: payload.metadata.amount,
            },
          },
        });

        await tx.transaction.create({
          data: {
            studentId: payload.studentId,
            totalAmount: payload.metadata.amount,
            adminShare: 0,
            transactionType: 'BALANCE_UP',
            description: `شحن رصيد بقيمة ${payload.metadata.amount} جنيه`,
          },
        });
      });

      console.log(
        `Balance topup successful for student ${payload.studentId}, amount: ${payload.metadata.amount}`,
      );
    } catch (error) {
      console.error('Error handling balance topup success:', error);
      throw error;
    }
  }
  async findStudentsByParentPhone(parentPhoneNumber: string) {
    return await this.prisma.student.findMany({
      where: {
        parentPhoneNumber,
      },
    });
  }

  createWithdrawRequest(studentId: number, body: CreateWithdrawRequestDto) {
    return this.userService.createWithdrawRequest(
      studentId,
      WithdrawUserType.STUDENT,
      body,
    );
  }

  async getAddresses(id: number) {
    return await this.prisma.address.findMany({
      where: {
        studentId: id,
      },
      include: {
        government: true,
        city: true,
      },
    });
  }

  async getStudentProfileForUpdate(studentId: number) {
    const student = await this.prisma.student.findUnique({
      where: {
        id: studentId,
      },
      select: {
        educationTypeId: true,
        secondLangId: true,
        schoolTypeId: true,
        parentPhoneNumber: true,
        gradeId: true,
        divisionId: true,
        schoolName: true,
        cityId: true,
        governmentId: true,
        user: {
          select: {
            displayName: true,
            phoneNumber: true,
            profilePicture: true,
          },
        },
      },
    });

    const [
      governments,
      cities,
      educationTypes,
      secondLangs,
      schoolTypes,
      grades,
      divisions,
    ] = await Promise.all([
      this.prisma.government.findMany(),
      this.prisma.city.findMany(),
      this.prisma.educationType.findMany(),
      this.prisma.secondLanguage.findMany(),
      this.prisma.schoolType.findMany(),
      this.prisma.grade.findMany(),
      this.prisma.division.findMany(),
    ]);

    return {
      student,
      governments,
      cities,
      educationTypes,
      secondLangs,
      schoolTypes,
      grades,
      divisions,
    };
  }

  async getMyCourses(studentId: number, query: GetStudentCoursesDto) {
    const {
      sortBy = StudentCourseSortBy.PURCHASE_DATE,
      sortOrder = SortOrder.DESC,
      pageNumber = 1,
      pageSize = 20,
      q,
      courseType,
      minPrice,
      maxPrice,
    } = query;

    const offset = (pageNumber - 1) * pageSize;

    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`sc."studentId" = ${studentId}`,
    ];

    if (q?.trim()) {
      whereConditions.push(
        Prisma.sql`c."courseName" ILIKE ${'%' + q.trim() + '%'}`,
      );
    }

    if (courseType !== undefined) {
      whereConditions.push(
        Prisma.sql`c."courseType"::"text" = ${courseType}::"text"`,
      );
    }

    if (minPrice !== undefined) {
      whereConditions.push(Prisma.sql`c.price >= ${minPrice}`);
    }

    if (maxPrice !== undefined) {
      whereConditions.push(Prisma.sql`c.price <= ${maxPrice}`);
    }

    const finalWhereClause = Prisma.sql`WHERE ${Prisma.join(
      whereConditions,
      ' AND ',
    )}`;

    let orderByClause: Prisma.Sql;
    const order =
      sortOrder === SortOrder.ASC ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    switch (sortBy) {
      case StudentCourseSortBy.COURSE_NAME:
        orderByClause = Prisma.sql`c."courseName" ${order}`;
        break;
      case StudentCourseSortBy.TEACHER_NAME:
        orderByClause = Prisma.sql`u."displayName" ${order}`;
        break;
      case StudentCourseSortBy.COURSE_TYPE:
        orderByClause = Prisma.sql`c."courseType" ${order}`;
        break;
      case StudentCourseSortBy.PRICE:
        orderByClause = Prisma.sql`c.price ${order}`;
        break;
      case StudentCourseSortBy.PURCHASE_DATE:
        orderByClause = Prisma.sql`sc."purchasedAt" ${order}`;
        break;
      case StudentCourseSortBy.EXPIRATION_DATE:
        orderByClause = Prisma.sql`sc."expiresAt" ${order}`;
        break;
      case StudentCourseSortBy.STATUS:
        orderByClause = Prisma.sql`sc."isActive" ${order}`;
        break;
      default:
        orderByClause = Prisma.sql`sc."purchasedAt" ${order}`;
    }

    const finalOrderByClause = Prisma.sql`ORDER BY ${orderByClause}, sc.id`;

    const [countResult, result] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint as count
        FROM "StudentCourse" sc
        INNER JOIN "Course" c ON sc."courseId" = c.id
        INNER JOIN "Teacher" t ON c."teacherId" = t.id
        INNER JOIN "User" u ON t.id = u.id
        ${finalWhereClause}
      `,
      this.prisma.$queryRaw<StudentCourseQueryResult[]>`
        SELECT 
          c.id as "id",
          c."courseName",
          c."courseType",
          c.price::float as price,
          sc."purchasedAt" as "purchaseDate",
          sc."expiresAt" as "expirationDate",
          sc."isActive" as status,
          u."displayName" as "teacherName"
        FROM "StudentCourse" sc
        INNER JOIN "Course" c ON sc."courseId" = c.id
        INNER JOIN "Teacher" t ON c."teacherId" = t.id
        INNER JOIN "User" u ON t.id = u.id
        ${finalWhereClause}
        ${finalOrderByClause}
        LIMIT ${pageSize} OFFSET ${offset}
      `,
    ]);

    const courses = result;
    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      courses,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }

  async getMyInvoices(studentId: number, query: GetStudentInvoicesDto) {
    const {
      sortBy = InvoiceSortBy.INVOICE_DATE,
      sortOrder = InvoiceSortOrder.DESC,
      pageNumber = 1,
      pageSize = 20,
      minAmount,
      maxAmount,
      paymentSource,
      status,
      minProducts,
      maxProducts,
    } = query;

    const offset = (pageNumber - 1) * pageSize;

    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`o."studentId" = ${studentId}`,
    ];

    if (minAmount !== undefined) {
      whereConditions.push(Prisma.sql`o."totalAmount" >= ${minAmount}`);
    }

    if (maxAmount !== undefined) {
      whereConditions.push(Prisma.sql`o."totalAmount" <= ${maxAmount}`);
    }

    if (status !== undefined) {
      whereConditions.push(Prisma.sql`o."status"::"text" = ${status}::"text"`);
    }

    if (paymentSource !== undefined) {
      whereConditions.push(
        Prisma.sql`t."paymentSource"::"text" = ${paymentSource}::"text"`,
      );
    }

    const finalWhereClause = Prisma.sql`WHERE ${Prisma.join(
      whereConditions,
      ' AND ',
    )}`;

    const havingConditions: Prisma.Sql[] = [];

    if (minProducts !== undefined) {
      havingConditions.push(Prisma.sql`COUNT(oi.id) >= ${minProducts}`);
    }

    if (maxProducts !== undefined) {
      havingConditions.push(Prisma.sql`COUNT(oi.id) <= ${maxProducts}`);
    }

    const finalHavingClause =
      havingConditions.length > 0
        ? Prisma.sql`HAVING ${Prisma.join(havingConditions, ' AND ')}`
        : Prisma.sql``;

    let orderByClause: Prisma.Sql;
    const order =
      sortOrder === InvoiceSortOrder.ASC ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    switch (sortBy) {
      case InvoiceSortBy.INVOICE_DATE:
        orderByClause = Prisma.sql`o."createdAt" ${order}`;
        break;
      case InvoiceSortBy.TOTAL_AMOUNT:
        orderByClause = Prisma.sql`o."totalAmount" ${order}`;
        break;
      case InvoiceSortBy.STATUS:
        orderByClause = Prisma.sql`o."status" ${order}`;
        break;
      case InvoiceSortBy.PAYMENT_SOURCE:
        orderByClause = Prisma.sql`t."paymentSource" ${order}`;
        break;
      case InvoiceSortBy.PRODUCTS_COUNT:
        orderByClause = Prisma.sql`"productsCount" ${order}`;
        break;
      default:
        orderByClause = Prisma.sql`o."createdAt" ${order}`;
    }

    const finalOrderByClause = Prisma.sql`ORDER BY ${orderByClause}, o.id`;

    const [countResult, result] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT o.id)::bigint as count
        FROM "Order" o
        LEFT JOIN "OrderItem" oi ON o.id = oi."orderId"
        LEFT JOIN "Transaction" t ON oi.id = t."orderItemId" AND t."transactionType" = 'ORDER'
        ${finalWhereClause}
        ${havingConditions.length > 0 ? Prisma.sql`GROUP BY o.id ${finalHavingClause}` : Prisma.sql``}
      `,
      this.prisma.$queryRaw<StudentInvoiceQueryResult[]>`
        SELECT 
          o.id as "invoiceNumber",
          o."createdAt" as "invoiceDate",
          COUNT(oi.id)::int as "productsCount",
          JSON_AGG(
            jsonb_build_object(
              'name', COALESCE(c."courseName", b."bookName"),
              'type', oi."productType",
              'price', oi.price::float
            )
          ) as products,
          o."totalAmount"::float as "totalAmount",
          o."status" as status,
          t."paymentSource" as "paymentSource"
        FROM "Order" o
        LEFT JOIN "OrderItem" oi ON o.id = oi."orderId"
        LEFT JOIN "Course" c ON oi."productId" = c.id AND oi."productType" = 'COURSE'
        LEFT JOIN "Book" b ON oi."productId" = b.id AND oi."productType" = 'BOOK'
        LEFT JOIN "Transaction" t ON oi.id = t."orderItemId" AND t."transactionType" = 'ORDER'
        ${finalWhereClause}
        GROUP BY o.id, o."createdAt", o."totalAmount", o."status", t."paymentSource"
        ${finalHavingClause}
        ${finalOrderByClause}
        LIMIT ${pageSize} OFFSET ${offset}
      `,
    ]);

    const invoices = result;
    const total =
      havingConditions.length > 0
        ? (countResult as unknown[]).length
        : Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      invoices,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }
  async getStudentStatistics(
    studentId: number,
    startDate?: Date | string,
    endDate?: Date | string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(end.getDate() - 30));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new NotFoundException('Invalid date parameters');
    }

    const periodDuration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodDuration);

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(2));
    };

    const createCard = (current: number, previous: number) => {
      const change = calculateChange(current, previous);
      let changeType: 'increase' | 'decrease' | 'neutral';
      if (current > previous) {
        changeType = 'increase';
      } else if (current < previous) {
        changeType = 'decrease';
      } else {
        changeType = 'neutral';
      }
      return {
        value: Number(current.toFixed(2)),
        change,
        changeType,
      };
    };

    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const groupBy = daysDiff > 60 ? 'month' : 'day';

    const formatDate = (date: Date) => {
      if (groupBy === 'month') {
        return date.toISOString().slice(0, 7);
      }
      return date.toISOString().slice(0, 10);
    };

    const studentCoursesWithLectures = await this.prisma.studentCourse.findMany(
      {
        where: { studentId, isActive: true },
        select: {
          course: {
            select: {
              CourseLecture: {
                select: {
                  lecture: {
                    select: {
                      id: true,
                      LectureContent: {
                        where: { contentType: 'VIDEO' },
                        select: { id: true, duration: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    );

    const lectureIds: number[] = [];
    const videoContentIds: number[] = [];
    const videoDurationMap = new Map<number, number>();

    studentCoursesWithLectures.forEach((sc) => {
      sc.course.CourseLecture.forEach((cl) => {
        lectureIds.push(cl.lecture.id);
        cl.lecture.LectureContent.forEach((lc) => {
          videoContentIds.push(lc.id);
          videoDurationMap.set(lc.id, lc.duration || 0);
        });
      });
    });

    const totalVideos = videoContentIds.length;

    const [
      allProgress,
      currentCompletedProgress,
      currentQuizAttempts,
      currentTransactions,
      prevCompletedProgress,
      prevQuizAttempts,
      weeklyCompletedVideos,
      weeklyQuizAttempts,
    ] = await Promise.all([
      this.prisma.studentLectureProgress.findMany({
        where: {
          studentId,
          lectureContentId: { in: videoContentIds },
        },
        select: { isCompleted: true },
      }),

      this.prisma.studentLectureProgress.findMany({
        where: {
          studentId,
          lectureContentId: { in: videoContentIds },
          isCompleted: true,
          completedAt: { gte: start, lte: end },
        },
        select: { lectureContentId: true, completedAt: true },
      }),

      this.prisma.quizAttempt.findMany({
        where: {
          studentId,
          quiz: { lectureId: { in: lectureIds } },
          isCompleted: true,
          completedAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          score: true,
          totalScore: true,
          completedAt: true,
          answers: {
            select: { isCorrect: true },
          },
        },
      }),

      this.prisma.transaction.findMany({
        where: {
          studentId,
          transactionType: 'ORDER',
          transactionDate: { gte: start, lte: end },
        },
        select: { totalAmount: true, transactionDate: true },
      }),

      this.prisma.studentLectureProgress.findMany({
        where: {
          studentId,
          lectureContentId: { in: videoContentIds },
          isCompleted: true,
          completedAt: { gte: prevStart, lt: start },
        },
        select: { lectureContentId: true },
      }),

      this.prisma.quizAttempt.findMany({
        where: {
          studentId,
          quiz: { lectureId: { in: lectureIds } },
          isCompleted: true,
          completedAt: { gte: prevStart, lt: start },
        },
        select: { score: true, totalScore: true },
      }),

      this.prisma.studentLectureProgress.findMany({
        where: {
          studentId,
          lectureContentId: { in: videoContentIds },
          isCompleted: true,
          completedAt: { gte: start, lte: end },
        },
        select: { completedAt: true },
      }),

      this.prisma.quizAttempt.findMany({
        where: {
          studentId,
          quiz: { lectureId: { in: lectureIds } },
          isCompleted: true,
          completedAt: { gte: start, lte: end },
        },
        select: { completedAt: true },
      }),
    ]);

    const currentQuizAnswers = currentQuizAttempts.flatMap((a) => a.answers);

    const completedVideosCount = allProgress.filter(
      (p) => p.isCompleted,
    ).length;
    const completionRate =
      totalVideos > 0
        ? Number(((completedVideosCount / totalVideos) * 100).toFixed(2))
        : 0;

    const prevCompletionRate =
      totalVideos > 0
        ? Number(
            ((prevCompletedProgress.length / totalVideos) * 100).toFixed(2),
          )
        : 0;

    const currentQuizSuccessRate =
      currentQuizAttempts.length > 0
        ? Number(
            (
              currentQuizAttempts.reduce(
                (sum, q) =>
                  sum +
                  ((q.score?.toNumber() || 0) / q.totalScore.toNumber()) * 100,
                0,
              ) / currentQuizAttempts.length
            ).toFixed(2),
          )
        : 0;

    const prevQuizSuccessRate =
      prevQuizAttempts.length > 0
        ? Number(
            (
              prevQuizAttempts.reduce(
                (sum, q) =>
                  sum +
                  ((q.score?.toNumber() || 0) / q.totalScore.toNumber()) * 100,
                0,
              ) / prevQuizAttempts.length
            ).toFixed(2),
          )
        : 0;

    const currentStudySeconds = currentCompletedProgress.reduce(
      (sum, p) => sum + (videoDurationMap.get(p.lectureContentId) || 0),
      0,
    );
    const currentStudyHours = Number((currentStudySeconds / 3600).toFixed(2));

    const prevStudySeconds = prevCompletedProgress.reduce(
      (sum, p) => sum + (videoDurationMap.get(p.lectureContentId) || 0),
      0,
    );
    const prevStudyHours = Number((prevStudySeconds / 3600).toFixed(2));

    const cards = {
      totalVideos: createCard(totalVideos, totalVideos),
      completionRate: createCard(completionRate, prevCompletionRate),
      quizSuccessRate: createCard(currentQuizSuccessRate, prevQuizSuccessRate),
      studyHours: createCard(currentStudyHours, prevStudyHours),
    };

    const videoProgress = [
      { status: 'completed', count: completedVideosCount },
      { status: 'notCompleted', count: totalVideos - completedVideosCount },
    ];

    const correctAnswers = currentQuizAnswers.filter(
      (a) => a.isCorrect === true,
    ).length;
    const incorrectAnswers = currentQuizAnswers.filter(
      (a) => a.isCorrect === false,
    ).length;

    const quizPerformance = [
      { status: 'correct', count: correctAnswers },
      { status: 'incorrect', count: incorrectAnswers },
    ];

    const pieCharts = {
      videoProgress,
      quizPerformance,
    };

    const dayNames = [
      'السبت',
      'الأحد',
      'الاثنين',
      'الثلاثاء',
      'الأربعاء',
      'الخميس',
      'الجمعة',
    ];

    const weeklyData = dayNames.map((day) => ({
      day,
      completedVideos: 0,
      quizzesTaken: 0,
    }));

    weeklyCompletedVideos.forEach((v) => {
      if (v.completedAt) {
        const dayIndex = (new Date(v.completedAt).getDay() + 1) % 7;
        weeklyData[dayIndex].completedVideos += 1;
      }
    });

    weeklyQuizAttempts.forEach((q) => {
      if (q.completedAt) {
        const dayIndex = (new Date(q.completedAt).getDay() + 1) % 7;
        weeklyData[dayIndex].quizzesTaken += 1;
      }
    });

    const areaChartDataMap = new Map<
      string,
      { date: string; spending: number }
    >();

    const currentDateIter = new Date(start);
    while (currentDateIter <= end) {
      const key = formatDate(currentDateIter);
      if (!areaChartDataMap.has(key)) {
        areaChartDataMap.set(key, { date: key, spending: 0 });
      }
      if (groupBy === 'month') {
        currentDateIter.setMonth(currentDateIter.getMonth() + 1);
      } else {
        currentDateIter.setDate(currentDateIter.getDate() + 1);
      }
    }

    let totalSpending = 0;
    currentTransactions.forEach((t) => {
      const amount = t.totalAmount.toNumber();
      totalSpending += amount;
      const key = formatDate(t.transactionDate);
      const entry = areaChartDataMap.get(key);
      if (entry) {
        entry.spending += amount;
      }
    });

    const areaChartData = Array.from(areaChartDataMap.values())
      .map((entry) => ({
        ...entry,
        spending: Number(entry.spending.toFixed(2)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      cards,
      charts: {
        pieCharts,
        barChart: weeklyData,
        areaChart: {
          data: areaChartData,
          totalSpending: Number(totalSpending.toFixed(2)),
        },
      },
    };
  }
}
