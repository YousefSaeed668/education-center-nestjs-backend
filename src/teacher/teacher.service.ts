import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType, WithdrawUserType } from '@prisma/client';
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
import { GetWithdrawRequestsDto } from './dto/get-withdrawal-requests.dto';
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
    return this.prisma.$transaction(async (prisma) => {
      const teacher = await prisma.user.findUnique({
        where: { id: teacherId },
        select: {
          balance: true,
        },
      });
      if (!teacher) {
        throw new NotFoundException('المعلم غير موجود');
      }
      if (teacher.balance.lessThan(body.amount)) {
        throw new BadRequestException(
          'رصيد المعلم غير كافٍ لإجراء عملية السحب',
        );
      }
      if (body.amount < 10) {
        throw new BadRequestException('اقل مبلغ للسحب هو 10 جنيهات');
      }
      const withdrawRequest = await prisma.withdrawRequest.create({
        data: {
          amount: body.amount,
          userId: teacherId,
          accountHolderName: body.accountHolderName,
          notes: body.notes,
          paymentMethod: body.paymentMethod,
          userType: WithdrawUserType.TEACHER,
          phoneNumber: body.phoneNumber,
        },
      });
      await prisma.user.update({
        where: { id: teacherId },
        data: {
          balance: {
            decrement: body.amount,
          },
        },
      });
      return {
        message: 'تم إنشاء طلب السحب بنجاح',
        status: 200,
        data: withdrawRequest,
      };
    });
  }

  async getTeacherEarnings(
    teacherId: number,
    startDate?: Date,
    endDate?: Date,
  ) {
    const startDateObj = startDate ? new Date(startDate) : undefined;
    const endDateObj = endDate ? new Date(endDate) : undefined;
    const whereClause = {
      teacherId,
      transactionType: TransactionType.ORDER,
      ...(startDate &&
        endDate && {
          transactionDate: {
            gte: startDateObj,
            lte: endDateObj,
          },
        }),
    };

    const earnings = await this.prisma.transaction.aggregate({
      where: whereClause,
      _sum: {
        teacherShare: true,
      },
    });
    const currentBalance = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: { balance: true },
    });

    return {
      totalEarnings: earnings._sum.teacherShare?.toNumber() || 0,
      currentBalance: currentBalance?.balance.toNumber() || 0,
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
  async getWithdrawRequests(teacherId: number, query: GetWithdrawRequestsDto) {
    const {
      pageNumber = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      maxAmount,
      minAmount,
      paymentMethod,
      status,
    } = query;
    const take = pageSize;
    const skip = (pageNumber - 1) * take;
    const whereClause: Prisma.WithdrawRequestWhereInput = {
      userId: teacherId,
    };
    if (minAmount !== undefined || maxAmount !== undefined) {
      whereClause.amount = {};

      if (minAmount !== undefined) {
        whereClause.amount.gte = minAmount;
      }

      if (maxAmount !== undefined) {
        whereClause.amount.lte = maxAmount;
      }
    }
    if (paymentMethod) {
      whereClause.paymentMethod = paymentMethod;
    }
    if (status) {
      whereClause.status = status;
    }
    const [count, withdrawals] = await Promise.all([
      this.prisma.withdrawRequest.count({
        where: whereClause,
      }),
      this.prisma.withdrawRequest.findMany({
        where: whereClause,
        orderBy: {
          [sortBy]: sortOrder.toLowerCase(),
        },
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          paymentMethod: true,
          adminNotes: true,
          accountHolderName: true,
        },
        take,
        skip,
      }),
    ]);
    const totalPages = Math.ceil(count / take);
    return {
      withdrawals,
      total: count,
      totalPages,
      pageNumber,
      pageSize: take,
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
}
