import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentSource } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CartService } from 'src/cart/cart.service';
import { HelperFunctionsService } from 'src/common/services/helperfunctions.service';
import { AddressDto } from 'src/order/dto/address-dto';
import { OrderService } from 'src/order/order.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { StudentService } from 'src/student/student.service';
import { UserService } from 'src/user/user.service';
import { ChooseStudentsDto } from './dto/choose-students.dto';
import { UpdateGuardianProfileDto } from './dto/update-guardian-profile.dto';

@Injectable()
export class GuardianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService,
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
    private readonly userService: UserService,
    private readonly s3Service: S3Service,
  ) {}
  async getStudentsWithParentNumber(guardianId: number) {
    const guardian = await this.prisma.user.findUnique({
      where: { id: guardianId },
      select: {
        phoneNumber: true,
      },
    });
    if (!guardian) {
      throw new NotFoundException('ولي الامر غير موجود');
    }
    const students = await this.studentService.findStudentsByParentPhone(
      guardian.phoneNumber,
    );
    if (students.students.length === 0) {
      throw new NotFoundException('لا يوجد طلاب مرتبطين برقم الهاتف هذا');
    }
    return students;
  }
  async chooseStudent(guardianId: number, body: ChooseStudentsDto) {
    const students = await this.prisma.student.updateMany({
      where: {
        id: {
          in: body.studentIds,
        },
        guardianId: null,
      },
      data: {
        guardianId,
        isGuardianVerified: true,
      },
    });
    if (students.count === 0) {
      throw new NotFoundException('لا يوجد طلاب متاحين للاختيار');
    }
    return {
      message: 'تم اختيار الطلاب بنجاح',
      success: true,
      data: students.count,
    };
  }
  async getStudentCart(guardianId: number, studentId: number) {
    return this.cartService.getCart(studentId, guardianId);
  }

  async createStudentCartOrder(
    guardianId: number,
    studentId: number,
    addressId?: number,
    newAddress?: AddressDto,
  ) {
    await this.verifyStudentBelongsToGuardian(guardianId, studentId);

    return this.orderService.createCartOrder(
      studentId,
      PaymentSource.CREDIT_CARD,
      addressId,
      newAddress,
    );
  }

  async verifyStudentBelongsToGuardian(guardianId: number, studentId: number) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { guardianId: true },
    });

    if (!student || student.guardianId !== guardianId) {
      throw new NotFoundException('الطالب غير موجود أو لا ينتمي إلى ولي الأمر');
    }
  }
  async rechargeStudentBalance(
    guardianId: number,
    studentId: number,
    amount: number,
  ) {
    await this.verifyStudentBelongsToGuardian(guardianId, studentId);
    return this.studentService.rechargeBalance(studentId, amount);
  }
  async getStudents(id: number) {
    const guardian = await this.prisma.guardian.findUnique({
      where: {
        id,
      },
      select: {
        students: {
          select: {
            id: true,
            user: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
    });
    if (!guardian) {
      throw new NotFoundException('ولي الامر غير موجود');
    }
    return {
      students: guardian.students.map((student) => {
        return {
          id: student.id,
          displayName: student.user.displayName,
        };
      }),
    };
  }
  async getStudentAddresses(guardianId: number, studentId: number) {
    await this.verifyStudentBelongsToGuardian(guardianId, studentId);
    return this.studentService.getAddresses(studentId);
  }
  async getStudentStatistics(
    guardianId: number,
    studentId: number,
    startDate?: Date | string,
    endDate?: Date | string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        guardianId: guardianId,
        isGuardianVerified: true,
      },
    });

    if (!student) {
      throw new ForbiddenException(
        'ليس لديك الصلاحية لرؤية احصائيات هذا الطالب',
      );
    }

    return this.studentService.getStudentStatistics(
      studentId,
      startDate,
      endDate,
    );
  }

  async updateProfile(
    guardianId: number,
    body: UpdateGuardianProfileDto,
    file?: Express.Multer.File,
  ) {
    let newProfilePictureUrl: string | undefined;
    try {
      if (file) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: guardianId },
          select: { profilePicture: true },
        });

        newProfilePictureUrl =
          await this.userService.handleProfilePictureUpdate(
            currentUser?.profilePicture || null,
            file,
            'guardian/profile-picture',
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

      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: guardianId },
          data: {
            ...userData,
            ...(body.phoneNumber && {
              guardian: {
                update: {
                  phoneNumber: body.phoneNumber,
                },
              },
            }),
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

  async getGuardianProfileForUpdate(guardianId: number) {
    const guardian = await this.prisma.guardian.findUnique({
      where: {
        id: guardianId,
      },
      select: {
        phoneNumber: true,
        user: {
          select: {
            displayName: true,
            phoneNumber: true,
            profilePicture: true,
          },
        },
      },
    });

    return guardian;
  }
}
