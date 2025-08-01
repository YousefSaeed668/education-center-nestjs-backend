import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { ProcessWithdrawRequestDto } from './dto/process-withdraw-request.dto';
import { GetAllUsersDto } from '../user/dto/get-all-users.dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  async getDashboardStats() {
    const teachers = await this.prisma.user.count({
      where: { role: 'TEACHER' },
    });
    const students = await this.prisma.user.count({
      where: { role: 'STUDENT' },
    });
    const guardians = await this.prisma.user.count({
      where: { role: 'GUARDIAN' },
    });
    const courses = await this.prisma.course.count();
    const books = await this.prisma.book.count();

    return {
      teachers,
      students,
      guardians,
      courses,
      books,
    };
  }

  async getFinancialStatistics(startDate?: Date, endDate?: Date) {
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'تاريخ البدء يجب ان يكون قبل تاريخ الانتهاء',
      );
    }
    const whereClause =
      startDate && endDate
        ? {
            transactionDate: {
              gte: startDate,
              lte: endDate,
            },
          }
        : {};

    const transactions = await this.prisma.transaction.findMany({
      where: whereClause,
      select: {
        transactionType: true,
        totalAmount: true,
        adminShare: true,
        teacherShare: true,
        transactionDate: true,
        paymentSource: true,
      },
    });

    const stats = transactions.reduce(
      (acc, transaction) => {
        const amount = transaction.totalAmount.toNumber();
        const adminShare = transaction.adminShare.toNumber();
        const teacherShare = transaction.teacherShare?.toNumber() || 0;

        if (transaction.transactionType === 'BALANCE_UP') {
          acc.totalRevenue += amount;
          acc.balanceTopups += amount;
          acc.balanceTopupCount++;
        }

        if (transaction.transactionType === 'ORDER') {
          acc.totalAdminProfits += adminShare;
          acc.totalTeacherEarnings += teacherShare;
          acc.salesCount++;

          if (transaction.paymentSource === 'CREDIT_CARD') {
            acc.totalRevenue += amount;
            acc.salesRevenue += amount;
          }
        }

        if (
          transaction.transactionType === 'TEACHER_WITHDRAWAL' ||
          transaction.transactionType === 'STUDENT_WITHDRAWAL'
        ) {
          acc.totalRevenue += amount;
        }

        return acc;
      },
      {
        totalRevenue: 0,
        totalAdminProfits: 0,
        totalTeacherEarnings: 0,
        salesRevenue: 0,
        salesCount: 0,
        balanceTopups: 0,
        balanceTopupCount: 0,
      },
    );

    const currentBalances = await this.getCurrentBalances();
    const withdrawalAmounts = await this.getTotalWithdrawnAmounts();

    const adminUser = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { balance: true },
    });

    const adminCurrentMoney = adminUser?.balance.toNumber() || 0;

    return {
      ...stats,
      ...currentBalances,
      ...withdrawalAmounts,
      adminCurrentMoney,
    };
  }

  async getCurrentBalances() {
    const teacherBalances = await this.prisma.user.aggregate({
      where: {
        role: 'TEACHER',
      },
      _sum: {
        balance: true,
      },
    });

    const studentBalances = await this.prisma.user.aggregate({
      where: {
        role: 'STUDENT',
      },
      _sum: {
        balance: true,
      },
    });

    return {
      totalTeacherBalances: teacherBalances._sum.balance?.toNumber() || 0,
      totalStudentBalances: studentBalances._sum.balance?.toNumber() || 0,
    };
  }

  async getTotalWithdrawnAmounts() {
    const completedWithdrawals = await this.prisma.withdrawRequest.aggregate({
      where: {
        status: 'COMPLETED',
      },
      _sum: {
        amount: true,
      },
    });

    const pendingWithdrawals = await this.prisma.withdrawRequest.aggregate({
      where: {
        status: {
          in: ['PENDING', 'APPROVED'],
        },
      },
      _sum: {
        amount: true,
      },
    });

    return {
      totalWithdrawn: completedWithdrawals._sum.amount?.toNumber() || 0,
      pendingWithdrawals: pendingWithdrawals._sum.amount?.toNumber() || 0,
    };
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
}
