import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentSource } from '@prisma/client';
import { CartService } from 'src/cart/cart.service';
import { AddressDto } from 'src/order/dto/address-dto';
import { OrderService } from 'src/order/order.service';
import { PrismaService } from 'src/prisma.service';
import { StudentService } from 'src/student/student.service';
import { ChooseStudentsDto } from './dto/choose-students.dto';

@Injectable()
export class GuardianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService,
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
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
}
