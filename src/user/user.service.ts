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
import { GetAllUsersDto } from './dto/get-all-users.dto';
import { GetWithdrawRequestsDto } from './dto/get-withdrawal-requests.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly imageService: ImageService,
  ) {}
  async getAllUsers(getAllUsersDto: GetAllUsersDto) {}

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
      // TODO : Make The minimum amount dynamic
      if (body.amount < 10) {
        throw new BadRequestException('اقل مبلغ للسحب هو 10 جنيهات');
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
