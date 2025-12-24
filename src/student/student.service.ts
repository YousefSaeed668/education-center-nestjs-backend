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
      success: true,
      message: 'تم إنشاء رابط شحن الرصيد بنجاح',
      data: url.url,
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
}
