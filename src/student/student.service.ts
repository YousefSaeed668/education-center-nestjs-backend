import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { UserService } from 'src/user/user.service';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { HelperFunctionsService } from 'src/common/services/helperfunctions.service';
import { PaymobService } from 'src/paymob/paymob.service';
import { PaymentPurpose } from 'src/paymob/IPaymob';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentSource, WithdrawUserType } from '@prisma/client';
import { CreateWithdrawRequestDto } from 'src/user/dto/create-withdraw-request.dto';

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
      data: url.data,
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
}
