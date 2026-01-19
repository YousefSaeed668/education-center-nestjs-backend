import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WithdrawUserType } from '@prisma/client';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateWithdrawRequestDto } from './dto/create-withdraw-request.dto';
import {
  GetAllUsersDto,
  GuardianUserResponse,
  PaginatedResponse,
  SortBy,
  SortOrder,
  StudentUserResponse,
  TeacherUserResponse,
  UserType,
} from './dto/get-all-users.dto';
import { GetWithdrawRequestsDto } from './dto/get-withdrawal-requests.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly imageService: ImageService,
  ) {}

  async getAllUsers(
    dto: GetAllUsersDto,
  ): Promise<
    PaginatedResponse<
      StudentUserResponse | TeacherUserResponse | GuardianUserResponse
    >
  > {
    switch (dto.userType) {
      case UserType.STUDENT:
        return this.getAllStudents(dto);
      case UserType.TEACHER:
        return this.getAllTeachers(dto);
      case UserType.GUARDIAN:
        return this.getAllGuardians(dto);
      default:
        throw new BadRequestException('Invalid user type');
    }
  }

  private async getAllStudents(
    dto: GetAllUsersDto,
  ): Promise<PaginatedResponse<StudentUserResponse>> {
    const {
      q,
      pageNumber = 1,
      pageSize = 20,
      sortOrder = SortOrder.DESC,
      sortBy = SortBy.CREATED_AT,
      registrationDateFrom,
      registrationDateTo,
      gradeId,
      schoolTypeId,
      educationTypeId,
      divisionId,
      isGuardianVerified,
      minBalance,
      maxBalance,
    } = dto;

    const skip = (pageNumber - 1) * pageSize;
    const sqlSortOrder = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    const conditions: string[] = [`u."role" = 'STUDENT'`];
    const params: any[] = [];
    let paramIndex = 1;

    if (q) {
      conditions.push(
        `(u."displayName" ILIKE $${paramIndex} OR u."userName" ILIKE $${paramIndex} OR u."phoneNumber" ILIKE $${paramIndex})`,
      );
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (registrationDateFrom) {
      conditions.push(`u."createdAt" >= $${paramIndex}::timestamp`);
      params.push(registrationDateFrom);
      paramIndex++;
    }
    if (registrationDateTo) {
      conditions.push(`u."createdAt" <= $${paramIndex}::timestamp`);
      params.push(registrationDateTo);
      paramIndex++;
    }

    if (minBalance !== undefined) {
      conditions.push(`u."balance" >= $${paramIndex}::decimal`);
      params.push(minBalance);
      paramIndex++;
    }
    if (maxBalance !== undefined) {
      conditions.push(`u."balance" <= $${paramIndex}::decimal`);
      params.push(maxBalance);
      paramIndex++;
    }

    if (gradeId) {
      conditions.push(`s."gradeId" = $${paramIndex}::int`);
      params.push(gradeId);
      paramIndex++;
    }
    if (schoolTypeId) {
      conditions.push(`s."schoolTypeId" = $${paramIndex}::int`);
      params.push(schoolTypeId);
      paramIndex++;
    }
    if (educationTypeId) {
      conditions.push(`s."educationTypeId" = $${paramIndex}::int`);
      params.push(educationTypeId);
      paramIndex++;
    }
    if (divisionId) {
      conditions.push(`s."divisionId" = $${paramIndex}::int`);
      params.push(divisionId);
      paramIndex++;
    }
    if (isGuardianVerified !== undefined) {
      conditions.push(`s."isGuardianVerified" = $${paramIndex}::boolean`);
      params.push(isGuardianVerified);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    let orderByClause: string;
    switch (sortBy) {
      case SortBy.BALANCE:
        orderByClause = `u."balance" ${sqlSortOrder}`;
        break;
      case SortBy.DISPLAY_NAME:
        orderByClause = `u."displayName" ${sqlSortOrder}`;
        break;
      case SortBy.GRADE:
        orderByClause = `g."name" ${sqlSortOrder}`;
        break;
      case SortBy.CREATED_AT:
      default:
        orderByClause = `u."createdAt" ${sqlSortOrder}`;
        break;
    }

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM "User" u
      INNER JOIN "Student" s ON s.id = u.id
      WHERE ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        u.id,
        u."displayName",
        u."userName",
        u."phoneNumber",
        g."name" AS "gradeName",
        st."name" AS "schoolTypeName",
        et."name" AS "educationTypeName",
        s."isGuardianVerified",
        u."balance"::float AS balance,
        u."createdAt"
      FROM "User" u
      INNER JOIN "Student" s ON s.id = u.id
      INNER JOIN "Grade" g ON g.id = s."gradeId"
      INNER JOIN "SchoolType" st ON st.id = s."schoolTypeId"
      INNER JOIN "EducationType" et ON et.id = s."educationTypeId"
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    const [countResult, data] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ count: number }[]>(countQuery, ...params),
      this.prisma.$queryRawUnsafe<StudentUserResponse[]>(dataQuery, ...params),
    ]);

    const total = countResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return {
      users: data,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }

  private async getAllTeachers(
    dto: GetAllUsersDto,
  ): Promise<PaginatedResponse<TeacherUserResponse>> {
    const {
      q,
      pageNumber = 1,
      pageSize = 20,
      sortOrder = SortOrder.DESC,
      sortBy = SortBy.CREATED_AT,
      registrationDateFrom,
      registrationDateTo,
      subjectId,
      educationTypeId,
      gradeIds,
      minBalance,
      maxBalance,
      minEarnings,
      maxEarnings,
      minPlatformShare,
      maxPlatformShare,
    } = dto;

    const skip = (pageNumber - 1) * pageSize;
    const sqlSortOrder = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    const conditions: string[] = [`u."role" = 'TEACHER'`];
    const params: any[] = [];
    let paramIndex = 1;

    if (q) {
      conditions.push(
        `(u."displayName" ILIKE $${paramIndex} OR u."userName" ILIKE $${paramIndex} OR u."phoneNumber" ILIKE $${paramIndex})`,
      );
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (registrationDateFrom) {
      conditions.push(`u."createdAt" >= $${paramIndex}::timestamp`);
      params.push(registrationDateFrom);
      paramIndex++;
    }
    if (registrationDateTo) {
      conditions.push(`u."createdAt" <= $${paramIndex}::timestamp`);
      params.push(registrationDateTo);
      paramIndex++;
    }

    if (minBalance !== undefined) {
      conditions.push(`u."balance" >= $${paramIndex}::decimal`);
      params.push(minBalance);
      paramIndex++;
    }
    if (maxBalance !== undefined) {
      conditions.push(`u."balance" <= $${paramIndex}::decimal`);
      params.push(maxBalance);
      paramIndex++;
    }

    if (subjectId) {
      conditions.push(`t."subjectId" = $${paramIndex}::int`);
      params.push(subjectId);
      paramIndex++;
    }
    if (educationTypeId) {
      conditions.push(`t."educationTypeId" = $${paramIndex}::int`);
      params.push(educationTypeId);
      paramIndex++;
    }

    if (gradeIds && gradeIds.length > 0) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM "_GradeToTeacher" gt 
          WHERE gt."B" = t.id AND gt."A" = ANY($${paramIndex}::int[])
        )
      `);
      params.push(gradeIds);
      paramIndex++;
    }

    if (minEarnings !== undefined) {
      conditions.push(`
        (SELECT COALESCE(SUM("teacherShare"), 0) FROM "Transaction" 
         WHERE "teacherId" = t.id AND "transactionType" = 'ORDER') >= $${paramIndex}::decimal
      `);
      params.push(minEarnings);
      paramIndex++;
    }
    if (maxEarnings !== undefined) {
      conditions.push(`
        (SELECT COALESCE(SUM("teacherShare"), 0) FROM "Transaction" 
         WHERE "teacherId" = t.id AND "transactionType" = 'ORDER') <= $${paramIndex}::decimal
      `);
      params.push(maxEarnings);
      paramIndex++;
    }
    if (minPlatformShare !== undefined) {
      conditions.push(`
        (SELECT COALESCE(SUM("adminShare"), 0) FROM "Transaction" 
         WHERE "teacherId" = t.id AND "transactionType" = 'ORDER') >= $${paramIndex}::decimal
      `);
      params.push(minPlatformShare);
      paramIndex++;
    }
    if (maxPlatformShare !== undefined) {
      conditions.push(`
        (SELECT COALESCE(SUM("adminShare"), 0) FROM "Transaction" 
         WHERE "teacherId" = t.id AND "transactionType" = 'ORDER') <= $${paramIndex}::decimal
      `);
      params.push(maxPlatformShare);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    let orderByClause: string;
    switch (sortBy) {
      case SortBy.BALANCE:
        orderByClause = `u."balance" ${sqlSortOrder}`;
        break;
      case SortBy.DISPLAY_NAME:
        orderByClause = `u."displayName" ${sqlSortOrder}`;
        break;
      case SortBy.TOTAL_COURSES:
        orderByClause = `"totalCourses" ${sqlSortOrder}`;
        break;
      case SortBy.TOTAL_BOOKS:
        orderByClause = `"totalBooks" ${sqlSortOrder}`;
        break;
      case SortBy.EARNINGS:
        orderByClause = `earnings ${sqlSortOrder}`;
        break;
      case SortBy.PLATFORM_SHARE:
        orderByClause = `"platformShare" ${sqlSortOrder}`;
        break;
      case SortBy.CREATED_AT:
      default:
        orderByClause = `u."createdAt" ${sqlSortOrder}`;
        break;
    }

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM "User" u
      INNER JOIN "Teacher" t ON t.id = u.id
      WHERE ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        u.id,
        u."displayName",
        u."userName",
        u."phoneNumber",
        sub."name" AS "subjectName",
        et."name" AS "educationTypeName",
        (SELECT COUNT(*)::int FROM "Course" WHERE "teacherId" = t.id) AS "totalCourses",
        (SELECT COUNT(*)::int FROM "Book" WHERE "teacherId" = t.id) AS "totalBooks",
        (SELECT COALESCE(SUM("teacherShare"), 0)::float FROM "Transaction" 
         WHERE "teacherId" = t.id AND "transactionType" = 'ORDER') AS earnings,
        u."balance"::float AS balance,
        (SELECT COALESCE(SUM("adminShare"), 0)::float FROM "Transaction" 
         WHERE "teacherId" = t.id AND "transactionType" = 'ORDER') AS "platformShare",
        u."createdAt",
        t."isActive"
      FROM "User" u
      INNER JOIN "Teacher" t ON t.id = u.id
      INNER JOIN "Subject" sub ON sub.id = t."subjectId"
      INNER JOIN "EducationType" et ON et.id = t."educationTypeId"
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    const [countResult, data] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ count: number }[]>(countQuery, ...params),
      this.prisma.$queryRawUnsafe<TeacherUserResponse[]>(dataQuery, ...params),
    ]);

    const total = countResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return {
      users: data,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }

  private async getAllGuardians(
    dto: GetAllUsersDto,
  ): Promise<PaginatedResponse<GuardianUserResponse>> {
    const {
      q,
      pageNumber = 1,
      pageSize = 20,
      sortOrder = SortOrder.DESC,
      sortBy = SortBy.CREATED_AT,
      registrationDateFrom,
      registrationDateTo,
      hasVerifiedStudents,
      minStudents,
      maxStudents,
    } = dto;

    const skip = (pageNumber - 1) * pageSize;
    const sqlSortOrder = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    const conditions: string[] = [`u."role" = 'GUARDIAN'`];
    const params: any[] = [];
    let paramIndex = 1;

    if (q) {
      conditions.push(
        `(u."displayName" ILIKE $${paramIndex} OR u."userName" ILIKE $${paramIndex} OR u."phoneNumber" ILIKE $${paramIndex})`,
      );
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (registrationDateFrom) {
      conditions.push(`u."createdAt" >= $${paramIndex}::timestamp`);
      params.push(registrationDateFrom);
      paramIndex++;
    }
    if (registrationDateTo) {
      conditions.push(`u."createdAt" <= $${paramIndex}::timestamp`);
      params.push(registrationDateTo);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const havingConditions: string[] = [];
    const havingParams: any[] = [];
    let havingParamIndex = paramIndex;

    if (hasVerifiedStudents !== undefined) {
      if (hasVerifiedStudents) {
        havingConditions.push(
          `COUNT(CASE WHEN s."isGuardianVerified" = true THEN 1 END) > 0`,
        );
      } else {
        havingConditions.push(
          `COUNT(CASE WHEN s."isGuardianVerified" = true THEN 1 END) = 0`,
        );
      }
    }

    if (minStudents !== undefined) {
      havingConditions.push(`COUNT(s.id) >= $${havingParamIndex}::int`);
      havingParams.push(minStudents);
      havingParamIndex++;
    }
    if (maxStudents !== undefined) {
      havingConditions.push(`COUNT(s.id) <= $${havingParamIndex}::int`);
      havingParams.push(maxStudents);
      havingParamIndex++;
    }

    const havingClause =
      havingConditions.length > 0
        ? `HAVING ${havingConditions.join(' AND ')}`
        : '';

    let orderByClause: string;
    switch (sortBy) {
      case SortBy.DISPLAY_NAME:
        orderByClause = `u."displayName" ${sqlSortOrder}`;
        break;
      case SortBy.STUDENTS_COUNT:
        orderByClause = `"linkedStudentsCount" ${sqlSortOrder}`;
        break;
      case SortBy.CREATED_AT:
      default:
        orderByClause = `u."createdAt" ${sqlSortOrder}`;
        break;
    }

    const allParams = [...params, ...havingParams];

    const countQuery = `
      SELECT COUNT(*)::int AS count FROM (
        SELECT u.id
        FROM "User" u
        INNER JOIN "Guardian" g ON g.id = u.id
        LEFT JOIN "Student" s ON s."guardianId" = g.id
        WHERE ${whereClause}
        GROUP BY u.id
        ${havingClause}
      ) subquery
    `;

    const dataQuery = `
      SELECT 
        u.id,
        u."displayName",
        u."userName",
        u."phoneNumber",
        COUNT(s.id)::int AS "linkedStudentsCount",
        COUNT(CASE WHEN s."isGuardianVerified" = true THEN 1 END)::int AS "verifiedStudentsCount",
        COUNT(CASE WHEN s."isGuardianVerified" = false THEN 1 END)::int AS "unverifiedStudentsCount",
        u."createdAt"
      FROM "User" u
      INNER JOIN "Guardian" g ON g.id = u.id
      LEFT JOIN "Student" s ON s."guardianId" = g.id
      WHERE ${whereClause}
      GROUP BY u.id, u."displayName", u."userName", u."phoneNumber", u."createdAt"
      ${havingClause}
      ORDER BY ${orderByClause}
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    const [countResult, data] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ count: number }[]>(
        countQuery,
        ...allParams,
      ),
      this.prisma.$queryRawUnsafe<GuardianUserResponse[]>(
        dataQuery,
        ...allParams,
      ),
    ]);

    const total = countResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return {
      users: data,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }

  async findUserById(id: number) {
    return await this.prisma.user.findUnique({
      where: {
        id,
      },
    });
  }
  async findUserByUsername(userName: string) {
    return await this.prisma.user.findUnique({
      where: {
        userName,
      },
    });
  }
  async handleProfilePictureUpdate(
    currentProfilePicture: string | null,
    file: Express.Multer.File,
    folder: string,
  ) {
    const compressedFile = await this.imageService.compressImage(file, {}, 80);
    try {
      const { url } = await this.s3Service.uploadSingleFile({
        file: compressedFile,
        folder,
        isPublic: true,
      });

      if (currentProfilePicture) {
        await this.s3Service
          .deleteFileByUrl(currentProfilePicture)
          .catch((error) => {
            console.error('Failed to delete old profile picture:', error);
          });
      }
      return url;
    } catch (error) {
      throw new Error(`فشل في تحديث صورة الملف الشخصي: ${error.message}`);
    }
  }
  async updateHashedRefreshToken(userId: number, hashedRt: string | null) {
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshToken: hashedRt,
      },
    });
  }

  async createWithdrawRequest(
    userId: number,
    userType: WithdrawUserType,
    body: CreateWithdrawRequestDto,
  ) {
    return this.prisma.$transaction(async (prisma) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          balance: true,
        },
      });

      if (!user) {
        const userTypeText =
          userType === WithdrawUserType.STUDENT ? 'الطالب' : 'المعلم';
        throw new NotFoundException(`${userTypeText} غير موجود`);
      }

      if (user.balance.lessThan(body.amount)) {
        const userTypeText =
          userType === WithdrawUserType.STUDENT ? 'الطالب' : 'المعلم';
        throw new BadRequestException(
          `رصيد ${userTypeText} غير كافٍ لإجراء عملية السحب`,
        );
      }
      const platformSetting = await this.prisma.platformSetting.findFirst({
        select: {
          minimumWithdrawAmount: true,
        },
      });
      if (!platformSetting) {
        throw new NotFoundException('الإعدادات غير موجودة');
      }
      if (body.amount < platformSetting?.minimumWithdrawAmount.toNumber()) {
        throw new BadRequestException(
          'اقل مبلغ للسحب هو ' +
            platformSetting?.minimumWithdrawAmount.toNumber(),
        );
      }

      const withdrawRequest = await prisma.withdrawRequest.create({
        data: {
          amount: body.amount,
          userId: userId,
          accountHolderName: body.accountHolderName,
          notes: body.notes,
          paymentMethod: body.paymentMethod,
          userType: userType,
          phoneNumber: body.phoneNumber,
        },
      });

      await prisma.user.update({
        where: { id: userId },
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
  async getWithdrawRequests(userId: number, query: GetWithdrawRequestsDto) {
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
    const whereClause: any = {
      userId: userId,
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

  async getAuthenticatedUserData(id: number) {
    return await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        profilePicture: true,
        displayName: true,
        balance: true,
      },
    });
  }
}
