import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { UserService } from 'src/user/user.service';
import { HelperFunctionsService } from 'src/common/services/helperfunctions.service';
import { TransactionType, WithdrawUserType } from '@prisma/client';
import { CreateWithdrawRequestDto } from 'src/user/dto/create-withdraw-request.dto';

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
      });
      await this.prisma.$transaction(async (tx) => {
        return await tx.user.update({
          where: { id: teacherId },
          data: {
            ...userData,
            ...(Object.keys(teacherData).length > 0 && {
              Teacher: {
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
  createWithdrawRequest(teacherId: number, body: CreateWithdrawRequestDto) {
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
}
