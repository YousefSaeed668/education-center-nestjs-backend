import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductType,
  TransactionType,
  WithdrawUserType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { HelperFunctionsService } from 'src/common/services/helperfunctions.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateWithdrawRequestDto } from 'src/user/dto/create-withdraw-request.dto';
import { UserService } from 'src/user/user.service';
import {
  GetTeachersDto,
  SortOrder,
  TeacherQueryResult,
  TeacherSortBy,
} from './dto/get-teachers.dto';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';

@Injectable()
export class TeacherService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  async updateProfile(
    teacherId: number,
    body: UpdateTeacherProfileDto,
    file?: Express.Multer.File,
  ) {
    let newProfilePictureUrl: string | undefined;
    try {
      if (file) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: teacherId },
          select: { profilePicture: true },
        });

        newProfilePictureUrl =
          await this.userService.handleProfilePictureUpdate(
            currentUser?.profilePicture || null,
            file,
            'teacher/profile-picture',
          );
      }
      const userData = HelperFunctionsService.removeUndefined({
        profilePicture: newProfilePictureUrl,
        displayName: body.displayName,
        phoneNumber: body.phoneNumber,
      });

      const teacherData = HelperFunctionsService.removeUndefined({
        bio: body.bio,
        socialMedia: body.socialMedia
          ? JSON.parse(body.socialMedia)
          : undefined,
        ...(body.gradeIds && {
          grade: {
            set: body.gradeIds.map((id) => ({ id: Number(id) })),
          },
        }),
        ...(body.divisionIds && {
          division: {
            set: body.divisionIds.map((id) => ({ id: Number(id) })),
          },
        }),
      });

      if (body.password) {
        userData['password'] = await bcrypt.hash(body.password, 10);
      }
      await this.prisma.$transaction(async (tx) => {
        return await tx.user.update({
          where: { id: teacherId },
          data: {
            ...userData,
            ...(Object.keys(teacherData).length > 0 && {
              teacher: {
                update: teacherData,
              },
            }),
          },
          include: {
            teacher: true,
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
  createWithdrawalRequest(teacherId: number, body: CreateWithdrawRequestDto) {
    return this.userService.createWithdrawRequest(
      teacherId,
      WithdrawUserType.TEACHER,
      body,
    );
  }

  async getTeacherEarnings(
    teacherId: number,
    startDate?: Date | string,
    endDate?: Date | string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(end.getDate() - 30));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date parameters');
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

    const platformSettings = await this.prisma.platformSetting.findFirst();
    const platformPercentage =
      platformSettings?.platformPercentage?.toNumber() || 0.1;

    const [
      currentStudents,
      currentCourses,
      currentBooks,
      currentLectures,
      currentQuizzes,
      currentRevenueAgg,
      currentPendingWithdrawals,
      currentCompletedWithdrawals,
      currentEnrollments,
      currentReviews,
      currentAvgRating,
      currentComments,
      currentPendingComments,
      currentQuizAttempts,

      prevStudents,
      prevCourses,
      prevBooks,
      prevLectures,
      prevQuizzes,
      prevRevenueAgg,
      prevCompletedWithdrawals,
      prevEnrollments,
      prevReviews,
      prevAvgRating,
      prevComments,
      prevPendingComments,
      prevQuizAttempts,

      transactions,
      enrollmentsList,
      reviewsList,
      commentsList,
      quizAttemptsList,
      coursesList,
    ] = await Promise.all([
      this.prisma.studentCourse.findMany({
        where: {
          course: { teacherId },
          purchasedAt: { gte: start, lte: end },
        },
        distinct: ['studentId'],
        select: { studentId: true },
      }),
      this.prisma.course.count({
        where: { teacherId, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.book.count({
        where: { teacherId, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.lecture.count({
        where: { teacherId, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.quiz.count({
        where: { teacherId, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.transaction.aggregate({
        where: {
          teacherId,
          transactionType: TransactionType.ORDER,
          transactionDate: { gte: start, lte: end },
        },
        _sum: { teacherShare: true },
      }),
      this.prisma.withdrawRequest.aggregate({
        where: { userId: teacherId, status: 'PENDING' },
        _sum: { amount: true },
      }),
      this.prisma.withdrawRequest.aggregate({
        where: {
          userId: teacherId,
          status: 'COMPLETED',
          createdAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
      }),
      this.prisma.studentCourse.count({
        where: {
          course: { teacherId },
          purchasedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.review.count({
        where: { course: { teacherId }, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.review.aggregate({
        where: { course: { teacherId }, createdAt: { gte: start, lte: end } },
        _avg: { rating: true },
      }),
      this.prisma.comment.count({
        where: {
          course: { teacherId },
          createdAt: { gte: start, lte: end },
          teacherId: null,
        },
      }),
      this.prisma.comment.count({
        where: {
          course: { teacherId },
          createdAt: { gte: start, lte: end },
          parentCommentId: null,
          replies: { none: {} },
          teacherId: null,
        },
      }),
      this.prisma.quizAttempt.count({
        where: { quiz: { teacherId }, startedAt: { gte: start, lte: end } },
      }),

      this.prisma.studentCourse.findMany({
        where: {
          course: { teacherId },
          purchasedAt: { gte: prevStart, lt: start },
        },
        distinct: ['studentId'],
        select: { studentId: true },
      }),
      this.prisma.course.count({
        where: { teacherId, createdAt: { gte: prevStart, lt: start } },
      }),
      this.prisma.book.count({
        where: { teacherId, createdAt: { gte: prevStart, lt: start } },
      }),
      this.prisma.lecture.count({
        where: { teacherId, createdAt: { gte: prevStart, lt: start } },
      }),
      this.prisma.quiz.count({
        where: { teacherId, createdAt: { gte: prevStart, lt: start } },
      }),
      this.prisma.transaction.aggregate({
        where: {
          teacherId,
          transactionType: TransactionType.ORDER,
          transactionDate: { gte: prevStart, lt: start },
        },
        _sum: { teacherShare: true },
      }),
      this.prisma.withdrawRequest.aggregate({
        where: {
          userId: teacherId,
          status: 'COMPLETED',
          createdAt: { gte: prevStart, lt: start },
        },
        _sum: { amount: true },
      }),
      this.prisma.studentCourse.count({
        where: {
          course: { teacherId },
          purchasedAt: { gte: prevStart, lt: start },
        },
      }),
      this.prisma.review.count({
        where: {
          course: { teacherId },
          createdAt: { gte: prevStart, lt: start },
        },
      }),
      this.prisma.review.aggregate({
        where: {
          course: { teacherId },
          createdAt: { gte: prevStart, lt: start },
        },
        _avg: { rating: true },
      }),
      this.prisma.comment.count({
        where: {
          course: { teacherId },
          createdAt: { gte: prevStart, lt: start },
          teacherId: null,
        },
      }),
      this.prisma.comment.count({
        where: {
          course: { teacherId },
          createdAt: { gte: prevStart, lt: start },
          parentCommentId: null,
          replies: { none: {} },
          teacherId: null,
        },
      }),
      this.prisma.quizAttempt.count({
        where: {
          quiz: { teacherId },
          startedAt: { gte: prevStart, lt: start },
        },
      }),

      this.prisma.transaction.findMany({
        where: {
          teacherId,
          transactionType: TransactionType.ORDER,
          transactionDate: { gte: start, lte: end },
        },
        include: { orderItem: true },
      }),
      this.prisma.studentCourse.findMany({
        where: {
          course: { teacherId },
          purchasedAt: { gte: start, lte: end },
        },
        include: { course: { select: { id: true, courseName: true } } },
      }),
      this.prisma.review.findMany({
        where: { course: { teacherId }, createdAt: { gte: start, lte: end } },
        include: { course: { select: { id: true } } },
      }),
      this.prisma.comment.findMany({
        where: {
          course: { teacherId },
          createdAt: { gte: start, lte: end },
          teacherId: null,
        },
        include: { course: { select: { id: true } } },
      }),
      this.prisma.quizAttempt.findMany({
        where: { quiz: { teacherId }, startedAt: { gte: start, lte: end } },
      }),
      this.prisma.course.findMany({
        where: { teacherId },
        select: { id: true, courseName: true },
      }),
    ]);

    const totalRevenueVal =
      currentRevenueAgg._sum.teacherShare?.toNumber() || 0;
    const prevTotalRevenueVal =
      prevRevenueAgg._sum.teacherShare?.toNumber() || 0;

    const myRevenueVal = Number(
      (totalRevenueVal * (1 - platformPercentage)).toFixed(2),
    );
    const prevMyRevenueVal = Number(
      (prevTotalRevenueVal * (1 - platformPercentage)).toFixed(2),
    );

    const cards = {
      students: createCard(currentStudents.length, prevStudents.length),
      courses: createCard(currentCourses, prevCourses),
      books: createCard(currentBooks, prevBooks),
      lectures: createCard(currentLectures, prevLectures),
      quizzes: createCard(currentQuizzes, prevQuizzes),
      totalRevenue: createCard(totalRevenueVal, prevTotalRevenueVal),
      myRevenue: createCard(myRevenueVal, prevMyRevenueVal),
      pendingWithdrawals: {
        value: Number(
          (currentPendingWithdrawals._sum.amount?.toNumber() || 0).toFixed(2),
        ),
        change: 0,
        changeType: 'neutral',
      },
      totalWithdrawals: createCard(
        currentCompletedWithdrawals._sum.amount?.toNumber() || 0,
        prevCompletedWithdrawals._sum.amount?.toNumber() || 0,
      ),
      enrollments: createCard(currentEnrollments, prevEnrollments),
      reviews: createCard(currentReviews, prevReviews),
      avgRating: createCard(
        currentAvgRating._avg.rating || 0,
        prevAvgRating._avg.rating || 0,
      ),
      comments: createCard(currentComments, prevComments),
      pendingComments: createCard(currentPendingComments, prevPendingComments),
      quizAttempts: createCard(currentQuizAttempts, prevQuizAttempts),
    };

    const areaChartDataMap = new Map<
      string,
      {
        date: string;
        revenue: number;
        enrollments: number;
        reviews: number;
      }
    >();

    const getAreaEntry = (dateKey: string) => {
      if (!areaChartDataMap.has(dateKey)) {
        areaChartDataMap.set(dateKey, {
          date: dateKey,
          revenue: 0,
          enrollments: 0,
          reviews: 0,
        });
      }
      return areaChartDataMap.get(dateKey)!;
    };

    const currentDateIter = new Date(start);
    while (currentDateIter <= end) {
      const key = formatDate(currentDateIter);
      if (!areaChartDataMap.has(key)) {
        areaChartDataMap.set(key, {
          date: key,
          revenue: 0,
          enrollments: 0,
          reviews: 0,
        });
      }

      if (groupBy === 'month') {
        currentDateIter.setMonth(currentDateIter.getMonth() + 1);
      } else {
        currentDateIter.setDate(currentDateIter.getDate() + 1);
      }
    }

    transactions.forEach((t) => {
      const key = formatDate(t.transactionDate);
      const entry = getAreaEntry(key);
      entry.revenue += Number((t.teacherShare?.toNumber() || 0).toFixed(2));
    });
    enrollmentsList.forEach((e) => {
      const key = formatDate(e.purchasedAt);
      const entry = getAreaEntry(key);
      entry.enrollments += 1;
    });
    reviewsList.forEach((r) => {
      const key = formatDate(r.createdAt);
      const entry = getAreaEntry(key);
      entry.reviews += 1;
    });

    const areaChart = Array.from(areaChartDataMap.values())
      .map((entry) => ({
        ...entry,
        revenue: Number(entry.revenue.toFixed(2)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const barChart = coursesList.map((course) => {
      const courseId = course.id;

      const enrollments = enrollmentsList.filter(
        (e) => e.courseId === courseId,
      ).length;

      const revenue = transactions
        .filter(
          (t) =>
            t.orderItem?.productId === courseId &&
            t.orderItem?.productType === ProductType.COURSE,
        )
        .reduce((sum, t) => sum + (t.teacherShare?.toNumber() || 0), 0);

      const courseReviews = reviewsList.filter((r) => r.courseId === courseId);
      const avgRating =
        courseReviews.length > 0
          ? courseReviews.reduce((sum, r) => sum + r.rating, 0) /
            courseReviews.length
          : 0;

      const comments = commentsList.filter(
        (c) => c.courseId === courseId,
      ).length;

      return {
        courseName: course.courseName,
        enrollments,
        revenue: Number(revenue.toFixed(2)),
        avgRating: Number(avgRating.toFixed(2)),
        comments,
      };
    });

    barChart.sort((a, b) => b.revenue - a.revenue);

    const topCoursesBarChart = barChart.slice(0, 5);

    const revenueByProduct = transactions.reduce(
      (acc, t) => {
        const type = t.orderItem?.productType;
        const amount = t.teacherShare?.toNumber() || 0;
        if (type === ProductType.COURSE) acc.courses += amount;
        if (type === ProductType.BOOK) acc.books += amount;
        return acc;
      },
      { courses: 0, books: 0 },
    );

    const pieChart = [
      {
        productType: 'courses',
        revenue: Number(revenueByProduct.courses.toFixed(2)),
      },
      {
        productType: 'books',
        revenue: Number(revenueByProduct.books.toFixed(2)),
      },
    ];

    const lineChartDataMap = new Map<
      string,
      {
        date: string;
        quizAttempts: number;
        comments: number;
        reviews: number;
      }
    >();

    const getLineEntry = (dateKey: string) => {
      if (!lineChartDataMap.has(dateKey)) {
        lineChartDataMap.set(dateKey, {
          date: dateKey,
          quizAttempts: 0,
          comments: 0,
          reviews: 0,
        });
      }
      return lineChartDataMap.get(dateKey)!;
    };

    const currentLineDateIter = new Date(start);
    while (currentLineDateIter <= end) {
      const key = formatDate(currentLineDateIter);
      if (!lineChartDataMap.has(key)) {
        lineChartDataMap.set(key, {
          date: key,
          quizAttempts: 0,
          comments: 0,
          reviews: 0,
        });
      }
      if (groupBy === 'month') {
        currentLineDateIter.setMonth(currentLineDateIter.getMonth() + 1);
      } else {
        currentLineDateIter.setDate(currentLineDateIter.getDate() + 1);
      }
    }

    quizAttemptsList.forEach((q) => {
      const key = formatDate(q.startedAt);
      getLineEntry(key).quizAttempts += 1;
    });
    commentsList.forEach((c) => {
      const key = formatDate(c.createdAt);
      getLineEntry(key).comments += 1;
    });
    reviewsList.forEach((r) => {
      const key = formatDate(r.createdAt);
      getLineEntry(key).reviews += 1;
    });

    const lineChart = Array.from(lineChartDataMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return {
      cards,
      charts: {
        areaChart,
        barChart: topCoursesBarChart,
        pieChart,
        lineChart,
      },
    };
  }

  async getTeachers(getTeachersDto: GetTeachersDto) {
    const {
      q,
      gradeId,
      subjectId,
      sortBy = TeacherSortBy.RATING,
      sortOrder = SortOrder.DESC,
      pageNumber = 1,
    } = getTeachersDto;
    const limit = 10;
    const offset = (pageNumber - 1) * limit;

    const whereConditions: Prisma.Sql[] = [Prisma.sql`t."isActive" = true`];

    if (gradeId !== undefined) {
      whereConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "_GradeToTeacher" gt WHERE gt."B" = t.id AND gt."A" = ${gradeId}
      )`);
    }

    if (subjectId !== undefined) {
      whereConditions.push(Prisma.sql`t."subjectId" = ${subjectId}`);
    }

    if (q?.trim()) {
      whereConditions.push(
        Prisma.sql`u."displayName" ILIKE ${'%' + q.trim() + '%'}`,
      );
    }

    const finalWhereClause = Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`;

    let orderByClause: Prisma.Sql;
    switch (sortBy) {
      case TeacherSortBy.DISPLAY_NAME:
        orderByClause = Prisma.sql`u."displayName" ${Prisma.raw(sortOrder)}`;
        break;
      case TeacherSortBy.COURSES_COUNT:
        orderByClause = Prisma.sql`COALESCE(course_count.course_count, 0) ${Prisma.raw(sortOrder)}`;
        break;
      case TeacherSortBy.BOOKS_COUNT:
        orderByClause = Prisma.sql`COALESCE(book_count.book_count, 0) ${Prisma.raw(sortOrder)}`;
        break;
      case TeacherSortBy.STUDENTS_COUNT:
        orderByClause = Prisma.sql`COALESCE(student_count.student_count, 0) ${Prisma.raw(sortOrder)}`;
        break;
      case TeacherSortBy.RATING:
        orderByClause = Prisma.sql`COALESCE(teacher_rating.avg_rating, 0) ${Prisma.raw(sortOrder)}`;
        break;
      default:
        orderByClause = Prisma.sql`COALESCE(teacher_rating.avg_rating, 0) ${Prisma.raw(sortOrder)}`;
    }
    const finalOrderByClause = Prisma.sql`ORDER BY ${orderByClause}, t.id`;

    const [totalResult, teachers] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ total_count: bigint }[]>`
      SELECT COUNT(t.id) as "total_count"
      FROM "Teacher" t
      INNER JOIN "User" u ON t.id = u.id
      ${finalWhereClause}
    `,

      this.prisma.$queryRaw<TeacherQueryResult[]>`
      SELECT 
        t.id ,
        u."profilePicture",
        u."displayName",
        s.name as "subjectName",
        t.bio,
        u.gender,
        COALESCE(teacher_rating.avg_rating, 0)::float as "avgRating",
        COALESCE(course_count.course_count, 0) as "numberOfCourses",
        COALESCE(book_count.book_count, 0) as "numberOfBooks",
        COALESCE(student_count.student_count, 0) as "numberOfStudents"
      FROM "Teacher" t
      INNER JOIN "User" u ON t.id = u.id
      LEFT JOIN "Subject" s ON t."subjectId" = s.id
      LEFT JOIN (
        SELECT 
          c."teacherId",
          COUNT(*)::int as course_count
        FROM "Course" c
        GROUP BY c."teacherId"
      ) course_count ON t.id = course_count."teacherId"
      LEFT JOIN (
        SELECT 
          b."teacherId",
          COUNT(*)::int as book_count
        FROM "Book" b
        GROUP BY b."teacherId"
      ) book_count ON t.id = book_count."teacherId"
      LEFT JOIN (
        SELECT 
          c."teacherId",
          COUNT(DISTINCT sc."studentId")::int as student_count
        FROM "Course" c
        LEFT JOIN "StudentCourse" sc ON c.id = sc."courseId" AND sc."isActive" = true
        GROUP BY c."teacherId"
      ) student_count ON t.id = student_count."teacherId"
      LEFT JOIN (
        SELECT 
          c."teacherId",
          ROUND(AVG(r.rating::numeric), 2) as avg_rating
        FROM "Course" c
        LEFT JOIN "Review" r ON c.id = r."courseId"
        WHERE r.rating IS NOT NULL
        GROUP BY c."teacherId"
      ) teacher_rating ON t.id = teacher_rating."teacherId"
      ${finalWhereClause}
      ${finalOrderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `,
    ]);

    const total = Number(totalResult[0]?.total_count || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      teachers,
      total,
      totalPages,
      pageNumber,
      pageSize: limit,
    };
  }

  async getTeacherClasses(userId: number) {
    const teacherClasses = await this.prisma.teacher.findUnique({
      where: {
        id: userId,
      },
      select: {
        division: {
          select: {
            name: true,
            id: true,
            gradeId: true,
          },
        },
        grade: {
          select: {
            name: true,
            id: true,
          },
        },
      },
    });

    return {
      divisions: teacherClasses?.division,
      grades: teacherClasses?.grade,
    };
  }

  async teacherInfoForUpdate(id: number) {
    const teacher = await this.prisma.teacher.findUnique({
      where: {
        id,
      },
      select: {
        socialMedia: true,
        division: true,
        bio: true,
        user: {
          select: {
            displayName: true,
            profilePicture: true,
            phoneNumber: true,
          },
        },
        grade: true,
      },
    });
    const [grades, divisions] = await Promise.all([
      this.prisma.grade.findMany(),
      this.prisma.division.findMany(),
    ]);
    return {
      teacher,
      grades,
      divisions,
    };
  }
  async getTeacherInfo(id: number) {
    const teacher = await this.prisma.teacher.findUnique({
      where: {
        id,
      },
      select: {
        _count: {
          select: {
            courses: true,
            book: true,
          },
        },
        user: {
          select: {
            displayName: true,
            profilePicture: true,
            gender: true,
          },
        },
        bio: true,
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
        socialMedia: true,
        grade: {
          select: {
            id: true,
            name: true,
          },
        },
        educationType: {
          select: {
            name: true,
            id: true,
          },
        },
        division: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!teacher) {
      throw new NotFoundException('المعلم غير موجود');
    }

    const avgRating = await this.prisma.review.aggregate({
      where: {
        course: {
          teacherId: id,
        },
      },
      _avg: {
        rating: true,
      },
      _count: {
        rating: true,
      },
    });

    const uniqueStudents = await this.prisma.studentCourse.groupBy({
      by: ['studentId'],
      where: {
        course: {
          teacherId: id,
        },
      },
    });

    return {
      ...teacher,
      averageRating: Number(avgRating._avg.rating?.toFixed(2)) || 0,
      totalReviews: avgRating._count.rating || 0,
      studentsCount: uniqueStudents.length,
    };
  }
}
