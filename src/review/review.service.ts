import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AddReviewDto } from './dto/add-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}
  async addReview(studentId: number, courseId: number, body: AddReviewDto) {
    await this.validateStudentCourseAccess(studentId, courseId);

    const existingReview = await this.prisma.review.findUnique({
      where: {
        studentId_courseId: { studentId, courseId },
      },
    });

    if (existingReview) {
      throw new ConflictException('لقد قمت بتقييم هذا الكورس من قبل');
    }

    return this.prisma.review.create({
      data: {
        text: body.text,
        rating: body.rating,
        studentId,
        courseId,
      },
      include: {
        student: {
          select: {
            id: true,
            user: {
              select: {
                displayName: true,
              },
            },
          },
        },
        course: {
          select: {
            id: true,
            courseName: true,
          },
        },
      },
    });
  }
  async updateReview(
    studentId: number,
    reviewId: number,
    body: UpdateReviewDto,
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        course: true,
      },
    });

    if (!review) {
      throw new NotFoundException('التقييم غير موجود');
    }

    if (review.studentId !== studentId) {
      throw new ForbiddenException('ليس لديك صلاحية لتعديل هذا التقييم');
    }

    await this.validateStudentCourseAccess(studentId, review.courseId);

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(body.text !== undefined && { text: body.text }),
        ...(body.rating !== undefined && { rating: body.rating }),
      },
      include: {
        student: {
          select: {
            id: true,
            user: {
              select: {
                displayName: true,
              },
            },
          },
        },
        course: {
          select: {
            id: true,
            courseName: true,
          },
        },
      },
    });
  }
  async deleteReview(studentId: number, reviewId: number) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('التقييم غير موجود');
    }

    if (review.studentId !== studentId) {
      throw new ForbiddenException('ليس لديك صلاحية لحذف هذا التقييم');
    }

    await this.prisma.review.delete({
      where: { id: reviewId },
    });

    return { message: 'تم حذف التقييم بنجاح' };
  }
  private async validateStudentCourseAccess(
    studentId: number,
    courseId: number,
  ) {
    const enrollment = await this.prisma.studentCourse.findUnique({
      where: {
        studentId_courseId: { studentId, courseId },
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('الطالب لا يملك هذا الكورس');
    }
  }
}
