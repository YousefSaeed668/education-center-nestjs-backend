import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { BookService } from 'src/book/book.service';
import { CourseService } from 'src/course/course.service';
import { PrismaService } from 'src/prisma.service';
import { UserService } from 'src/user/user.service';
import { GetAllUsersDto } from '../user/dto/get-all-users.dto';
import {
  ContentResponse,
  ContentSortBy,
  GetAllContentDto,
  PaginatedContentsResponse,
} from './dto/get-all-content.dto';
import {
  GetAllWithdrawRequestsDto,
  PaginatedWithdrawResponse,
  SortOrder,
  WithdrawRequestResponse,
  WithdrawSortBy,
} from './dto/get-all-withdraw-requests.dto';
import {
  DashboardCardType,
  GrowthLineChartItem,
  OrdersStatusChartItem,
  RevenueChartItem,
  RevenuePieChartItem,
  TeacherPerformanceChartItem,
  TopContentChartItem,
  WithdrawalsChartItem,
} from './dto/get-dashboard-statistics.dto';
import { ProcessWithdrawRequestDto } from './dto/process-withdraw-request.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseService: CourseService,
    private readonly bookService: BookService,
    private readonly userService: UserService,
  ) {}
  async getAllWithdrawRequests(
    dto: GetAllWithdrawRequestsDto,
  ): Promise<PaginatedWithdrawResponse> {
    const {
      q,
      pageNumber = 1,
      pageSize = 20,
      sortOrder = SortOrder.DESC,
      sortBy = WithdrawSortBy.CREATED_AT,
      status,
      userType,
      paymentMethod,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
    } = dto;

    const skip = (pageNumber - 1) * pageSize;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (userType) {
      where.userType = userType;
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) where.amount.gte = minAmount;
      if (maxAmount !== undefined) where.amount.lte = maxAmount;
    }

    if (q) {
      where.OR = [
        { user: { displayName: { contains: q, mode: 'insensitive' } } },
        { user: { userName: { contains: q, mode: 'insensitive' } } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
        { accountHolderName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: any = {};
    const orderDirection = sortOrder.toLowerCase();

    switch (sortBy) {
      case WithdrawSortBy.DISPLAY_NAME:
        orderBy.user = { displayName: orderDirection };
        break;
      case WithdrawSortBy.USERNAME:
        orderBy.user = { userName: orderDirection };
        break;
      case WithdrawSortBy.PAYMENT_METHOD:
        orderBy.paymentMethod = orderDirection;
        break;
      case WithdrawSortBy.ACCOUNT_HOLDER_NAME:
        orderBy.accountHolderName = orderDirection;
        break;
      case WithdrawSortBy.BALANCE:
        orderBy.user = { balance: orderDirection };
        break;
      case WithdrawSortBy.PROCESSED_BY_NAME:
        orderBy.admin = { displayName: orderDirection };
        break;
      case WithdrawSortBy.PROCESSED_AT:
        orderBy.processedAt = orderDirection;
        break;
      case WithdrawSortBy.AMOUNT:
        orderBy.amount = orderDirection;
        break;
      case WithdrawSortBy.STATUS:
        orderBy.status = orderDirection;
        break;
      case WithdrawSortBy.USER_TYPE:
        orderBy.userType = orderDirection;
        break;
      case WithdrawSortBy.CREATED_AT:
      default:
        orderBy.createdAt = orderDirection;
        break;
    }

    const [total, withdrawRequests] = await Promise.all([
      this.prisma.withdrawRequest.count({ where }),
      this.prisma.withdrawRequest.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          status: true,
          userType: true,
          amount: true,
          paymentMethod: true,
          notes: true,
          phoneNumber: true,
          accountHolderName: true,
          processedAt: true,
          user: {
            select: {
              displayName: true,
              userName: true,
              balance: true,
            },
          },
          admin: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    const data: WithdrawRequestResponse[] = withdrawRequests.map((wr) => ({
      id: wr.id,
      createdAt: wr.createdAt,
      status: wr.status,
      displayName: wr.user.displayName,
      userName: wr.user.userName,
      userType: wr.userType,
      amount: Number(wr.amount),
      notes: wr.notes,
      paymentMethod: wr.paymentMethod,
      phoneNumber: wr.phoneNumber,
      accountHolderName: wr.accountHolderName,
      userBalance: Number(wr.user.balance),
      processedByName: wr.admin?.displayName || null,
      processedAt: wr.processedAt,
    }));

    return {
      withdrawRequests: data,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }
  async getDashboardStatistics(startDate: Date, endDate: Date) {
    const [cards, charts] = await Promise.all([
      this.getCardsData(startDate, endDate),
      this.getChartsData(startDate, endDate),
    ]);

    return { cards, charts };
  }

  private async getCardsData(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, DashboardCardType>> {
    const result = await this.prisma.$queryRaw<any[]>`
      WITH date_params AS (
        SELECT 
          ${startDate}::timestamp AS curr_start,
          ${endDate}::timestamp AS curr_end,
          ${startDate}::timestamp - (${endDate}::timestamp - ${startDate}::timestamp) AS prev_start,
          ${startDate}::timestamp AS prev_end
      ),
      
      user_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_users_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_users_prev,
          COUNT(*) FILTER (WHERE "createdAt" <= (SELECT curr_end FROM date_params)) AS total_users,
          COUNT(*) FILTER (WHERE role = 'STUDENT' AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_students_curr,
          COUNT(*) FILTER (WHERE role = 'STUDENT' AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_students_prev,
          COUNT(*) FILTER (WHERE role = 'STUDENT' AND "createdAt" <= (SELECT curr_end FROM date_params)) AS total_students,
          COUNT(*) FILTER (WHERE role = 'TEACHER' AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_teachers_curr,
          COUNT(*) FILTER (WHERE role = 'TEACHER' AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_teachers_prev,
          COUNT(*) FILTER (WHERE role = 'TEACHER' AND "createdAt" <= (SELECT curr_end FROM date_params)) AS total_teachers,
          COUNT(*) FILTER (WHERE role = 'GUARDIAN' AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_guardians_curr,
          COUNT(*) FILTER (WHERE role = 'GUARDIAN' AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_guardians_prev,
          COUNT(*) FILTER (WHERE role = 'GUARDIAN' AND "createdAt" <= (SELECT curr_end FROM date_params)) AS total_guardians
        FROM "User"
      ),
      
      active_teacher_stats AS (
        SELECT
          COUNT(DISTINCT t.id) FILTER (WHERE c."createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params) OR b."createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS active_teachers_curr,
          COUNT(DISTINCT t.id) FILTER (WHERE c."createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params) OR b."createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS active_teachers_prev,
          COUNT(DISTINCT CASE WHEN t."isActive" = true THEN t.id END) AS total_active_teachers
        FROM "Teacher" t
        LEFT JOIN "Course" c ON c."teacherId" = t.id
        LEFT JOIN "Book" b ON b."teacherId" = t.id
      ),
      
      revenue_stats AS (
        SELECT
          COALESCE(SUM("totalAmount") FILTER (WHERE "transactionType" = 'ORDER' AND "transactionDate" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)), 0) AS total_revenue_curr,
          COALESCE(SUM("totalAmount") FILTER (WHERE "transactionType" = 'ORDER' AND "transactionDate" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)), 0) AS total_revenue_prev,
          COALESCE(SUM("adminShare") FILTER (WHERE "transactionType" = 'ORDER' AND "transactionDate" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)), 0) AS platform_revenue_curr,
          COALESCE(SUM("adminShare") FILTER (WHERE "transactionType" = 'ORDER' AND "transactionDate" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)), 0) AS platform_revenue_prev,
          COALESCE(SUM("teacherShare") FILTER (WHERE "transactionType" = 'ORDER' AND "transactionDate" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)), 0) AS teachers_revenue_curr,
          COALESCE(SUM("teacherShare") FILTER (WHERE "transactionType" = 'ORDER' AND "transactionDate" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)), 0) AS teachers_revenue_prev
        FROM "Transaction"
      ),
      
      withdrawal_stats AS (
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE status IN ('PENDING', 'APPROVED') AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)), 0) AS pending_withdrawals_curr,
          COALESCE(SUM(amount) FILTER (WHERE status IN ('PENDING', 'APPROVED') AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)), 0) AS pending_withdrawals_prev,
          COALESCE(SUM(amount) FILTER (WHERE status = 'COMPLETED' AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)), 0) AS completed_withdrawals_curr,
          COALESCE(SUM(amount) FILTER (WHERE status = 'COMPLETED' AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)), 0) AS completed_withdrawals_prev
        FROM "WithdrawRequest"
      ),
      
      order_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS total_orders_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS total_orders_prev,
          COUNT(*) FILTER (WHERE status = 'PENDING' AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS pending_orders_curr,
          COUNT(*) FILTER (WHERE status = 'PENDING' AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS pending_orders_prev,
          COUNT(*) FILTER (WHERE status = 'COMPLETED' AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS completed_orders_curr,
          COUNT(*) FILTER (WHERE status = 'COMPLETED' AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS completed_orders_prev,
          COUNT(*) FILTER (WHERE status = 'CANCELLED' AND "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS cancelled_orders_curr,
          COUNT(*) FILTER (WHERE status = 'CANCELLED' AND "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS cancelled_orders_prev
        FROM "Order"
      ),
      
      enrollment_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "purchasedAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS total_enrollments_curr,
          COUNT(*) FILTER (WHERE "purchasedAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS total_enrollments_prev
        FROM "StudentCourse"
      ),
      
      review_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS total_reviews_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS total_reviews_prev,
          COALESCE(AVG(rating) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)), 0) AS avg_rating_curr,
          COALESCE(AVG(rating) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)), 0) AS avg_rating_prev
        FROM "Review"
      ),
      
      comment_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS total_comments_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS total_comments_prev
        FROM "Comment"
      ),
      
      quiz_attempt_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "startedAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS total_quiz_attempts_curr,
          COUNT(*) FILTER (WHERE "startedAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS total_quiz_attempts_prev
        FROM "QuizAttempt"
      ),
      
      course_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_courses_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_courses_prev,
          COUNT(*) FILTER (WHERE "createdAt" <= (SELECT curr_end FROM date_params)) AS total_courses
        FROM "Course"
      ),
      
      book_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_books_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_books_prev,
          COUNT(*) FILTER (WHERE "createdAt" <= (SELECT curr_end FROM date_params)) AS total_books
        FROM "Book"
      ),
      
      lecture_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_lectures_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_lectures_prev,
          COUNT(*) FILTER (WHERE "createdAt" <= (SELECT curr_end FROM date_params)) AS total_lectures
        FROM "Lecture"
      ),
      
      quiz_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT curr_start FROM date_params) AND (SELECT curr_end FROM date_params)) AS new_quizzes_curr,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN (SELECT prev_start FROM date_params) AND (SELECT prev_end FROM date_params)) AS new_quizzes_prev,
          COUNT(*) FILTER (WHERE "createdAt" <= (SELECT curr_end FROM date_params)) AS total_quizzes,
          COUNT(*) FILTER (WHERE "isActive" = true AND "createdAt" <= (SELECT curr_end FROM date_params)) AS active_quizzes_curr,
          COUNT(*) FILTER (WHERE "isActive" = true AND "createdAt" <= (SELECT prev_end FROM date_params)) AS active_quizzes_prev
        FROM "Quiz"
      )
      SELECT 
        u.*, at.*, r.*, w.*, o.*, e.*, rv.*, cm.*, qa.*, cs.*, bs.*, ls.*, qs.*
      FROM user_stats u
      CROSS JOIN active_teacher_stats at
      CROSS JOIN revenue_stats r
      CROSS JOIN withdrawal_stats w
      CROSS JOIN order_stats o
      CROSS JOIN enrollment_stats e
      CROSS JOIN review_stats rv
      CROSS JOIN comment_stats cm
      CROSS JOIN quiz_attempt_stats qa
      CROSS JOIN course_stats cs
      CROSS JOIN book_stats bs
      CROSS JOIN lecture_stats ls
      CROSS JOIN quiz_stats qs
    `;

    const data = result[0];

    const calculateCard = (
      currValue: number,
      prevValue: number,
    ): DashboardCardType => {
      const change =
        prevValue === 0
          ? currValue > 0
            ? 100
            : 0
          : ((currValue - prevValue) / prevValue) * 100;
      return {
        value: Number(currValue),
        change: Math.round(change * 100) / 100,
        changeType:
          change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
      };
    };

    return {
      newUsersThisMonth: calculateCard(
        Number(data.new_users_curr),
        Number(data.new_users_prev),
      ),
      totalRevenue: calculateCard(
        Number(data.total_revenue_curr),
        Number(data.total_revenue_prev),
      ),
      platformRevenue: calculateCard(
        Number(data.platform_revenue_curr),
        Number(data.platform_revenue_prev),
      ),
      teachersRevenue: calculateCard(
        Number(data.teachers_revenue_curr),
        Number(data.teachers_revenue_prev),
      ),
      pendingWithdrawals: calculateCard(
        Number(data.pending_withdrawals_curr),
        Number(data.pending_withdrawals_prev),
      ),
      completedWithdrawals: calculateCard(
        Number(data.completed_withdrawals_curr),
        Number(data.completed_withdrawals_prev),
      ),
      totalOrders: calculateCard(
        Number(data.total_orders_curr),
        Number(data.total_orders_prev),
      ),
      pendingOrders: calculateCard(
        Number(data.pending_orders_curr),
        Number(data.pending_orders_prev),
      ),
      completedOrders: calculateCard(
        Number(data.completed_orders_curr),
        Number(data.completed_orders_prev),
      ),
      cancelledOrders: calculateCard(
        Number(data.cancelled_orders_curr),
        Number(data.cancelled_orders_prev),
      ),
      totalEnrollments: calculateCard(
        Number(data.total_enrollments_curr),
        Number(data.total_enrollments_prev),
      ),
      totalReviews: calculateCard(
        Number(data.total_reviews_curr),
        Number(data.total_reviews_prev),
      ),
      totalComments: calculateCard(
        Number(data.total_comments_curr),
        Number(data.total_comments_prev),
      ),
      totalQuizAttempts: calculateCard(
        Number(data.total_quiz_attempts_curr),
        Number(data.total_quiz_attempts_prev),
      ),
      totalUsers: calculateCard(
        Number(data.total_users),
        Number(data.total_users) - Number(data.new_users_curr),
      ),
      totalStudents: calculateCard(
        Number(data.total_students),
        Number(data.total_students) - Number(data.new_students_curr),
      ),
      totalTeachers: calculateCard(
        Number(data.total_teachers),
        Number(data.total_teachers) - Number(data.new_teachers_curr),
      ),
      activeTeachers: calculateCard(
        Number(data.total_active_teachers),
        Number(data.total_active_teachers) -
          Number(data.active_teachers_curr) +
          Number(data.active_teachers_prev),
      ),
      totalGuardians: calculateCard(
        Number(data.total_guardians),
        Number(data.total_guardians) - Number(data.new_guardians_curr),
      ),
      totalCourses: calculateCard(
        Number(data.total_courses),
        Number(data.total_courses) - Number(data.new_courses_curr),
      ),
      totalBooks: calculateCard(
        Number(data.total_books),
        Number(data.total_books) - Number(data.new_books_curr),
      ),
      totalLectures: calculateCard(
        Number(data.total_lectures),
        Number(data.total_lectures) - Number(data.new_lectures_curr),
      ),
      totalQuizzes: calculateCard(
        Number(data.total_quizzes),
        Number(data.total_quizzes) - Number(data.new_quizzes_curr),
      ),
      activeQuizzes: calculateCard(
        Number(data.active_quizzes_curr),
        Number(data.active_quizzes_prev),
      ),
      avgPlatformRating: calculateCard(
        Number(data.avg_rating_curr),
        Number(data.avg_rating_prev),
      ),
    };
  }

  private async getChartsData(startDate: Date, endDate: Date) {
    const [
      revenueChart,
      topContentChart,
      revenuePieChart,
      growthChart,
      withdrawalsChart,
      ordersStatusChart,
      teacherPerformanceChart,
    ] = await Promise.all([
      this.getRevenueChart(startDate, endDate),
      this.getTopContentChart(startDate, endDate),
      this.getRevenuePieChart(startDate, endDate),
      this.getGrowthChart(startDate, endDate),
      this.getWithdrawalsChart(startDate, endDate),
      this.getOrdersStatusChart(startDate, endDate),
      this.getTeacherPerformanceChart(startDate, endDate),
    ]);

    return {
      revenueChart,
      topContentChart,
      revenuePieChart,
      growthChart,
      withdrawalsChart,
      ordersStatusChart,
      teacherPerformanceChart,
    };
  }

  private async getRevenueChart(
    startDate: Date,
    endDate: Date,
  ): Promise<RevenueChartItem[]> {
    const result = await this.prisma.$queryRaw<RevenueChartItem[]>`
      SELECT 
        TO_CHAR(DATE_TRUNC('day', t."transactionDate"), 'YYYY-MM-DD') AS date,
        COALESCE(SUM(t."adminShare")::numeric, 0) AS "platformRevenue",
        COALESCE(SUM(t."teacherShare")::numeric, 0) AS "teachersRevenue",
        COUNT(DISTINCT t."orderItemId")::integer AS orders
      FROM "Transaction" t
      WHERE t."transactionType" = 'ORDER'
        AND t."transactionDate" BETWEEN ${startDate} AND ${endDate}
      GROUP BY DATE_TRUNC('day', t."transactionDate")
      ORDER BY date
    `;
    return result.map((r) => ({
      date: r.date,
      platformRevenue: Number(Number(r.platformRevenue).toFixed(2)),
      teachersRevenue: Number(Number(r.teachersRevenue).toFixed(2)),
      orders: Number(r.orders),
    }));
  }

  private async getTopContentChart(
    startDate: Date,
    endDate: Date,
  ): Promise<TopContentChartItem[]> {
    const result = await this.prisma.$queryRaw<TopContentChartItem[]>`
      WITH course_data AS (
        SELECT 
          c.id,
          c."courseName" AS name,
          'course' AS type,
          COUNT(DISTINCT sc.id) AS enrollments,
          COALESCE(SUM(t."totalAmount"), 0) AS revenue,
          COALESCE(AVG(r.rating), 0) AS "avgRating",
          u."displayName" AS "teacherName"
        FROM "Course" c
        LEFT JOIN "StudentCourse" sc ON sc."courseId" = c.id AND sc."purchasedAt" BETWEEN ${startDate} AND ${endDate}
        LEFT JOIN "OrderItem" oi ON oi."productId" = c.id AND oi."productType" = 'COURSE'
        LEFT JOIN "Transaction" t ON t."orderItemId" = oi.id AND t."transactionDate" BETWEEN ${startDate} AND ${endDate}
        LEFT JOIN "Review" r ON r."courseId" = c.id AND r."createdAt" BETWEEN ${startDate} AND ${endDate}
        JOIN "Teacher" te ON te.id = c."teacherId"
        JOIN "User" u ON u.id = te.id
        GROUP BY c.id, c."courseName", u."displayName"
      ),
      book_data AS (
        SELECT 
          b.id,
          b."bookName" AS name,
          'book' AS type,
          0 AS enrollments,
          COALESCE(SUM(t."totalAmount"), 0) AS revenue,
          COALESCE(AVG(r.rating), 0) AS "avgRating",
          u."displayName" AS "teacherName"
        FROM "Book" b
        LEFT JOIN "OrderItem" oi ON oi."productId" = b.id AND oi."productType" = 'BOOK'
        LEFT JOIN "Transaction" t ON t."orderItemId" = oi.id AND t."transactionDate" BETWEEN ${startDate} AND ${endDate}
        LEFT JOIN "Review" r ON r."bookId" = b.id AND r."createdAt" BETWEEN ${startDate} AND ${endDate}
        JOIN "Teacher" te ON te.id = b."teacherId"
        JOIN "User" u ON u.id = te.id
        GROUP BY b.id, b."bookName", u."displayName"
      ),
      combined AS (
        SELECT * FROM course_data
        UNION ALL
        SELECT * FROM book_data
      )
      SELECT * FROM combined
      ORDER BY revenue DESC
      LIMIT 5
    `;
    return result.map((r) => ({
      id: Number(r.id),
      name: r.name,
      type: r.type,
      enrollments: Number(r.enrollments),
      revenue: Number(Number(r.revenue).toFixed(2)),
      avgRating: Number(Number(r.avgRating).toFixed(2)),
      teacherName: r.teacherName,
    }));
  }

  private async getRevenuePieChart(
    startDate: Date,
    endDate: Date,
  ): Promise<RevenuePieChartItem[]> {
    const result = await this.prisma.$queryRaw<any[]>`
      WITH revenue_by_type AS (
        SELECT 
          oi."productType"::text AS product_type,
          COALESCE(SUM(t."totalAmount"), 0) AS revenue
        FROM "Transaction" t
        JOIN "OrderItem" oi ON oi.id = t."orderItemId"
        WHERE t."transactionType" = 'ORDER'
          AND t."transactionDate" BETWEEN ${startDate} AND ${endDate}
        GROUP BY oi."productType"
      ),
      total AS (
        SELECT SUM(revenue) AS total_revenue FROM revenue_by_type
      )
      SELECT 
        r.product_type,
        r.revenue::numeric,
        CASE WHEN t.total_revenue > 0 
          THEN ROUND((r.revenue / t.total_revenue * 100)::numeric, 2)
          ELSE 0 
        END AS percentage
      FROM revenue_by_type r
      CROSS JOIN total t
    `;

    const categoryMap: Record<string, string> = {
      COURSE: 'الكورسات',
      BOOK: 'الكتب',
    };

    return result.map((r) => ({
      category: categoryMap[r.product_type] || r.product_type,
      revenue: Number(Number(r.revenue).toFixed(2)),
      percentage: Number(Number(r.percentage).toFixed(2)),
    }));
  }

  private async getGrowthChart(
    startDate: Date,
    endDate: Date,
  ): Promise<GrowthLineChartItem[]> {
    const result = await this.prisma.$queryRaw<GrowthLineChartItem[]>`
      WITH date_series AS (
        SELECT generate_series(
          DATE_TRUNC('day', ${startDate}::timestamp),
          DATE_TRUNC('day', ${endDate}::timestamp),
          '1 day'::interval
        )::date AS date
      ),
      student_counts AS (
        SELECT DATE_TRUNC('day', "createdAt")::date AS date, COUNT(*) AS count
        FROM "User"
        WHERE role = 'STUDENT' AND "createdAt" BETWEEN ${startDate} AND ${endDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
      ),
      teacher_counts AS (
        SELECT DATE_TRUNC('day', "createdAt")::date AS date, COUNT(*) AS count
        FROM "User"
        WHERE role = 'TEACHER' AND "createdAt" BETWEEN ${startDate} AND ${endDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
      ),
      order_counts AS (
        SELECT DATE_TRUNC('day', "createdAt")::date AS date, COUNT(*) AS count
        FROM "Order"
        WHERE "createdAt" BETWEEN ${startDate} AND ${endDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
      ),
      enrollment_counts AS (
        SELECT DATE_TRUNC('day', "purchasedAt")::date AS date, COUNT(*) AS count
        FROM "StudentCourse"
        WHERE "purchasedAt" BETWEEN ${startDate} AND ${endDate}
        GROUP BY DATE_TRUNC('day', "purchasedAt")
      )
      SELECT 
        TO_CHAR(ds.date, 'YYYY-MM-DD') AS date,
        COALESCE(sc.count, 0)::integer AS "newStudents",
        COALESCE(tc.count, 0)::integer AS "newTeachers",
        COALESCE(oc.count, 0)::integer AS "newOrders",
        COALESCE(ec.count, 0)::integer AS "newEnrollments"
      FROM date_series ds
      LEFT JOIN student_counts sc ON sc.date = ds.date
      LEFT JOIN teacher_counts tc ON tc.date = ds.date
      LEFT JOIN order_counts oc ON oc.date = ds.date
      LEFT JOIN enrollment_counts ec ON ec.date = ds.date
      ORDER BY ds.date
    `;
    return result.map((r) => ({
      date: r.date,
      newStudents: Number(r.newStudents),
      newTeachers: Number(r.newTeachers),
      newOrders: Number(r.newOrders),
      newEnrollments: Number(r.newEnrollments),
    }));
  }

  private async getWithdrawalsChart(
    startDate: Date,
    endDate: Date,
  ): Promise<WithdrawalsChartItem[]> {
    const result = await this.prisma.$queryRaw<WithdrawalsChartItem[]>`
      WITH date_series AS (
        SELECT generate_series(
          DATE_TRUNC('day', ${startDate}::timestamp),
          DATE_TRUNC('day', ${endDate}::timestamp),
          '1 day'::interval
        )::date AS date
      )
      SELECT 
        TO_CHAR(ds.date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(CASE WHEN w."userType" = 'TEACHER' THEN w.amount ELSE 0 END), 0)::numeric AS "teacherWithdrawals",
        COALESCE(SUM(CASE WHEN w."userType" = 'STUDENT' THEN w.amount ELSE 0 END), 0)::numeric AS "studentWithdrawals",
        COALESCE(SUM(CASE WHEN w.status IN ('PENDING', 'APPROVED') THEN w.amount ELSE 0 END), 0)::numeric AS pending,
        COALESCE(SUM(CASE WHEN w.status = 'COMPLETED' THEN w.amount ELSE 0 END), 0)::numeric AS completed
      FROM date_series ds
      LEFT JOIN "WithdrawRequest" w ON DATE_TRUNC('day', w."createdAt")::date = ds.date
        AND w."createdAt" BETWEEN ${startDate} AND ${endDate}
      GROUP BY ds.date
      ORDER BY ds.date
    `;
    return result.map((r) => ({
      date: r.date,
      teacherWithdrawals: Number(Number(r.teacherWithdrawals).toFixed(2)),
      studentWithdrawals: Number(Number(r.studentWithdrawals).toFixed(2)),
      pending: Number(Number(r.pending).toFixed(2)),
      completed: Number(Number(r.completed).toFixed(2)),
    }));
  }

  private async getOrdersStatusChart(
    startDate: Date,
    endDate: Date,
  ): Promise<OrdersStatusChartItem[]> {
    const result = await this.prisma.$queryRaw<any[]>`
      WITH status_counts AS (
        SELECT status, COUNT(*) AS count
        FROM "Order"
        WHERE "createdAt" BETWEEN ${startDate} AND ${endDate}
        GROUP BY status
      ),
      total AS (
        SELECT SUM(count) AS total_count FROM status_counts
      )
      SELECT 
        sc.status,
        sc.count::integer,
        CASE WHEN t.total_count > 0 
          THEN ROUND((sc.count::numeric / t.total_count * 100), 2)
          ELSE 0 
        END AS percentage
      FROM status_counts sc
      CROSS JOIN total t
    `;

    const statusMap: Record<string, string> = {
      PENDING: 'قيد الانتظار',
      COMPLETED: 'مكتمل',
      CANCELLED: 'ملغي',
    };

    return result.map((r) => ({
      status: statusMap[r.status] || r.status,
      count: Number(r.count),
      percentage: Number(Number(r.percentage).toFixed(2)),
    }));
  }

  private async getTeacherPerformanceChart(
    startDate: Date,
    endDate: Date,
  ): Promise<TeacherPerformanceChartItem[]> {
    const result = await this.prisma.$queryRaw<TeacherPerformanceChartItem[]>`
      SELECT 
        t.id AS "teacherId",
        u."displayName" AS "teacherName",
        COALESCE(SUM(tr."teacherShare"), 0) AS revenue,
        COUNT(DISTINCT c.id) AS "coursesCount",
        COUNT(DISTINCT b.id) AS "booksCount"
      FROM "Teacher" t
      JOIN "User" u ON u.id = t.id
      LEFT JOIN "Course" c ON c."teacherId" = t.id
      LEFT JOIN "Book" b ON b."teacherId" = t.id
      LEFT JOIN "Transaction" tr ON tr."teacherId" = t.id 
        AND tr."transactionDate" BETWEEN ${startDate} AND ${endDate} 
        AND tr."transactionType" = 'ORDER'
      WHERE t."isActive" = true
      GROUP BY t.id, u."displayName"
      ORDER BY revenue DESC
      LIMIT 5
    `;
    return result.map((r) => ({
      teacherId: Number(r.teacherId),
      teacherName: r.teacherName,
      revenue: Number(Number(r.revenue).toFixed(2)),
      coursesCount: Number(r.coursesCount),
      booksCount: Number(r.booksCount),
    }));
  }

  async processWithdrawal(
    adminId: number,
    withdrawalId: number,
    processDto: ProcessWithdrawRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawRequest.findUnique({
        where: {
          id: withdrawalId,
        },
        include: {
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!withdrawal) {
        throw new NotFoundException('طلب السحب غير موجود');
      }

      if (
        withdrawal.status === 'REJECTED' ||
        withdrawal.status === 'COMPLETED'
      ) {
        throw new BadRequestException('طلب السحب تم معالجته بالفعل');
      }

      await tx.withdrawRequest.update({
        where: { id: withdrawalId },
        data: {
          status: processDto.status,
          adminNotes: processDto.adminNotes,
          processedBy: adminId,
          processedAt: new Date(),
        },
      });

      if (processDto.status === 'COMPLETED') {
        await tx.transaction.create({
          data: {
            [withdrawal.userType === 'TEACHER' ? 'teacherId' : 'studentId']:
              withdrawal.userId,
            totalAmount: -withdrawal.amount.toNumber(),
            paymentSource: 'BALANCE',
            adminShare: 0,
            teacherShare:
              withdrawal.userType === 'TEACHER'
                ? -withdrawal.amount.toNumber()
                : null,
            transactionType:
              withdrawal.userType === 'TEACHER'
                ? 'TEACHER_WITHDRAWAL'
                : 'STUDENT_WITHDRAWAL',
            transactionDate: new Date(),
            description: `سحب ${withdrawal.userType === 'TEACHER' ? 'معلم' : 'طالب'} بقيمة ${withdrawal.amount.toNumber()} جنيه`,
          },
        });

        const adminUser = await tx.user.findFirst({
          where: { role: 'ADMIN' },
        });

        if (!adminUser) {
          throw new Error('Admin user not found');
        }

        await tx.user.update({
          where: { id: adminUser.id },
          data: {
            balance: {
              decrement: withdrawal.amount.toNumber(),
            },
          },
        });
      }

      if (processDto.status === 'REJECTED') {
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            balance: {
              increment: withdrawal.amount.toNumber(),
            },
          },
        });
      }

      return {
        message: 'تم إتمام عملية السحب بنجاح',
      };
    });
  }

  async updateAdminBalance(
    amount: number,
    operation: 'ADD' | 'SUBTRACT',
    tx?: any,
  ) {
    const prisma = tx || this.prisma;

    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminUser) {
      throw new BadRequestException('Insufficient admin balance');
    }

    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        balance: {
          [operation === 'ADD' ? 'increment' : 'decrement']: Number(amount),
        },
      },
    });
  }

  async updatePlatformSettings(
    adminId: number,
    settings: UpdatePlatformSettingsDto,
  ) {
    const admin = await this.prisma.user.findUnique({
      where: {
        id: adminId,
        role: 'ADMIN',
      },
    });
    if (!admin) {
      throw new NotFoundException('المسؤول غير موجود');
    }

    const platformSettings = await this.prisma.platformSetting.findFirst({
      select: {
        id: true,
      },
    });

    if (!platformSettings) {
      throw new NotFoundException('الاعدادات غير موجودة');
    }
    return await this.prisma.platformSetting.update({
      where: {
        id: platformSettings.id,
      },
      data: settings,
    });
  }
  getAllUsers(getAllUsersDto: GetAllUsersDto) {
    return this.userService.getAllUsers(getAllUsersDto);
  }

  async deleteUser(userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('المستخدم غير موجود');
      }

      if (user.role === 'GUARDIAN') {
        await tx.student.updateMany({
          where: { guardianId: userId },
          data: { guardianId: null },
        });
      }

      const student = await tx.student.findUnique({
        where: { id: userId },
      });

      if (student) {
        await tx.order.deleteMany({
          where: { studentId: student.id },
        });
      }

      if (user.role === 'TEACHER') {
        const courses = await tx.course.findMany({
          where: { teacherId: userId },
          select: { id: true },
        });
        const lectures = await tx.lecture.findMany({
          where: { teacherId: userId },
          select: { id: true },
        });

        const courseIds = courses.map((c) => c.id);
        const lectureIds = lectures.map((l) => l.id);

        if (courseIds.length > 0 || lectureIds.length > 0) {
          await tx.courseLecture.deleteMany({
            where: {
              OR: [
                { courseId: { in: courseIds } },
                { lectureId: { in: lectureIds } },
              ],
            },
          });
        }
      }

      await tx.transaction.deleteMany({
        where: {
          OR: [{ studentId: userId }, { teacherId: userId }],
        },
      });

      await tx.user.delete({
        where: { id: userId },
      });

      return { message: 'تم حذف المستخدم وجميع بياناته بنجاح' };
    });
  }

  async getAllContent(
    dto: GetAllContentDto,
  ): Promise<PaginatedContentsResponse> {
    const {
      q,
      pageNumber = 1,
      pageSize = 20,
      sortOrder = 'DESC',
      sortBy = ContentSortBy.CREATED_AT,
      productType,
      teacherId,
      minPrice,
      maxPrice,
      dateFrom,
      dateTo,
      minEarnings,
      maxEarnings,
      minPlatformShare,
      maxPlatformShare,
    } = dto;

    const offset = (pageNumber - 1) * pageSize;

    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (q) {
      whereConditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (productType) {
      whereConditions.push(`product_type = $${paramIndex}`);
      params.push(productType);
      paramIndex++;
    }

    if (teacherId) {
      whereConditions.push(`teacher_id = $${paramIndex}`);
      params.push(teacherId);
      paramIndex++;
    }

    if (minPrice !== undefined) {
      whereConditions.push(`price >= $${paramIndex}`);
      params.push(minPrice);
      paramIndex++;
    }

    if (maxPrice !== undefined) {
      whereConditions.push(`price <= $${paramIndex}`);
      params.push(maxPrice);
      paramIndex++;
    }

    if (dateFrom) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    if (minEarnings !== undefined) {
      whereConditions.push(`earnings >= $${paramIndex}`);
      params.push(minEarnings);
      paramIndex++;
    }

    if (maxEarnings !== undefined) {
      whereConditions.push(`earnings <= $${paramIndex}`);
      params.push(maxEarnings);
      paramIndex++;
    }

    if (minPlatformShare !== undefined) {
      whereConditions.push(`platform_share >= $${paramIndex}`);
      params.push(minPlatformShare);
      paramIndex++;
    }

    if (maxPlatformShare !== undefined) {
      whereConditions.push(`platform_share <= $${paramIndex}`);
      params.push(maxPlatformShare);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    const sortColumnMap: Record<string, string> = {
      [ContentSortBy.CREATED_AT]: 'created_at',
      [ContentSortBy.PRICE]: 'price',
      [ContentSortBy.NAME]: 'name',
      [ContentSortBy.PRODUCT_TYPE]: 'product_type',
      [ContentSortBy.TEACHER_NAME]: 'teacher_name',
      [ContentSortBy.EARNINGS]: 'earnings',
      [ContentSortBy.PLATFORM_SHARE]: 'platform_share',
      [ContentSortBy.SOLD_COUNT]: 'sold_count',
    };

    const sortColumn = sortColumnMap[sortBy] || 'created_at';
    const sortDirection = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    const baseQuery = `
      WITH content_data AS (
        SELECT 
          c.id,
          'COURSE'::text AS product_type,
          c."courseName" AS name,
          c.price::numeric AS price,
          c."teacherId" AS teacher_id,
          u."displayName" AS teacher_name,
          c."subjectId" AS subject_id,
          s.name AS subject,
          c."gradeId" AS grade_id,
          g.name AS grade,
          c."createdAt" AS created_at,
          ARRAY_AGG(DISTINCT d.id) FILTER (WHERE d.id IS NOT NULL) AS division_ids,
          ARRAY_AGG(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL) AS divisions,
          COALESCE((
            SELECT SUM(t."totalAmount")
            FROM "Transaction" t
            JOIN "OrderItem" oi ON oi.id = t."orderItemId"
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."productId" = c.id 
              AND oi."productType" = 'COURSE'
              AND o.status = 'COMPLETED'
              AND t."transactionType" = 'ORDER'
          ), 0) AS earnings,
          COALESCE((
            SELECT SUM(t."adminShare")
            FROM "Transaction" t
            JOIN "OrderItem" oi ON oi.id = t."orderItemId"
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."productId" = c.id 
              AND oi."productType" = 'COURSE'
              AND o.status = 'COMPLETED'
              AND t."transactionType" = 'ORDER'
          ), 0) AS platform_share,
          COALESCE((
            SELECT COUNT(DISTINCT oi.id)
            FROM "OrderItem" oi
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."productId" = c.id 
              AND oi."productType" = 'COURSE'
              AND o.status = 'COMPLETED'
          ), 0) AS sold_count
        FROM "Course" c
        JOIN "Teacher" t ON t.id = c."teacherId"
        JOIN "User" u ON u.id = t.id
        JOIN "Subject" s ON s.id = c."subjectId"
        JOIN "Grade" g ON g.id = c."gradeId"
        LEFT JOIN "_CourseToDivision" cd ON cd."A" = c.id
        LEFT JOIN "Division" d ON d.id = cd."B"
        GROUP BY c.id, c."courseName", c.price, c."teacherId", u."displayName", 
                 c."subjectId", s.name, c."gradeId", g.name, c."createdAt"

        UNION ALL

        SELECT 
          b.id,
          'BOOK'::text AS product_type,
          b."bookName" AS name,
          b.price::numeric AS price,
          b."teacherId" AS teacher_id,
          u."displayName" AS teacher_name,
          b."subjectId" AS subject_id,
          s.name AS subject,
          b."gradeId" AS grade_id,
          g.name AS grade,
          b."createdAt" AS created_at,
          ARRAY_AGG(DISTINCT d.id) FILTER (WHERE d.id IS NOT NULL) AS division_ids,
          ARRAY_AGG(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL) AS divisions,
          COALESCE((
            SELECT SUM(t."totalAmount")
            FROM "Transaction" t
            JOIN "OrderItem" oi ON oi.id = t."orderItemId"
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."productId" = b.id 
              AND oi."productType" = 'BOOK'
              AND o.status = 'COMPLETED'
              AND t."transactionType" = 'ORDER'
          ), 0) AS earnings,
          COALESCE((
            SELECT SUM(t."adminShare")
            FROM "Transaction" t
            JOIN "OrderItem" oi ON oi.id = t."orderItemId"
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."productId" = b.id 
              AND oi."productType" = 'BOOK'
              AND o.status = 'COMPLETED'
              AND t."transactionType" = 'ORDER'
          ), 0) AS platform_share,
          COALESCE((
            SELECT COUNT(DISTINCT oi.id)
            FROM "OrderItem" oi
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."productId" = b.id 
              AND oi."productType" = 'BOOK'
              AND o.status = 'COMPLETED'
          ), 0) AS sold_count
        FROM "Book" b
        JOIN "Teacher" t ON t.id = b."teacherId"
        JOIN "User" u ON u.id = t.id
        JOIN "Subject" s ON s.id = b."subjectId"
        JOIN "Grade" g ON g.id = b."gradeId"
        LEFT JOIN "_BookToDivision" bd ON bd."A" = b.id
        LEFT JOIN "Division" d ON d.id = bd."B"
        GROUP BY b.id, b."bookName", b.price, b."teacherId", u."displayName", 
                 b."subjectId", s.name, b."gradeId", g.name, b."createdAt"
      )
    `;

    const countQuery = `
      ${baseQuery}
      SELECT COUNT(*) as total FROM content_data ${whereClause}
    `;

    const dataQuery = `
      ${baseQuery}
      SELECT 
        id,
        product_type,
        name,
        price,
        teacher_name,
        subject,
        grade,
        divisions,
        earnings,
        platform_share,
        sold_count,
        created_at
      FROM content_data
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataParams = [...params, pageSize, offset];

    const [countResult, dataResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<[{ total: bigint }]>(countQuery, ...params),
      this.prisma.$queryRawUnsafe<any[]>(dataQuery, ...dataParams),
    ]);

    const total = Number(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / pageSize);

    const content: ContentResponse[] = dataResult.map((row) => ({
      id: Number(row.id),
      productType: row.product_type as 'COURSE' | 'BOOK',
      name: row.name,
      price: Number(row.price),
      teacherName: row.teacher_name,
      subject: row.subject,
      grade: row.grade,
      divisions: row.divisions || [],
      earnings: Number(row.earnings),
      platformShare: Number(row.platform_share),
      soldCount: Number(row.sold_count),
      createdAt: row.created_at,
    }));

    return {
      content,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }
  async deleteContent(id: number, productType: ProductType) {
    if (productType === ProductType.COURSE) {
      await this.courseService.deleteCourse(id);
      return;
    }
    if (productType === ProductType.BOOK) {
      await this.bookService.deleteBook(id);
      return;
    }
  }
}
