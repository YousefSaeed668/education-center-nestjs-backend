import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { AddReviewDto } from './dto/add-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  private readonly REVIEWS_PER_PAGE = 10;

  private getReviewSelect() {
    return {
      id: true,
      text: true,
      rating: true,
      createdAt: true,
      productType: true,
      productId: true,
      student: {
        select: {
          user: {
            select: {
              id: true,
              displayName: true,
              profilePicture: true,
            },
          },
        },
      },
    };
  }

  async getReviews(
    productType: ProductType,
    productId: number,
    cursor?: number,
  ) {
    const limit = this.REVIEWS_PER_PAGE;

    const totalCount = await this.prisma.review.count({
      where: { productType, productId },
    });

    const reviews = await this.prisma.review.findMany({
      where: { productType, productId },
      select: this.getReviewSelect(),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    const hasMore = reviews.length > limit;
    const data = hasMore ? reviews.slice(0, limit) : reviews;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      pagination: {
        nextCursor,
        hasMore,
        totalCount,
      },
    };
  }

  async getReviewsForStudent(
    productType: ProductType,
    productId: number,
    studentId: number,
    cursor?: number,
  ) {
    const limit = this.REVIEWS_PER_PAGE;

    const userReview = await this.prisma.review.findUnique({
      where: {
        studentId_productType_productId: {
          studentId,
          productType,
          productId,
        },
      },
      select: this.getReviewSelect(),
    });

    const hasReviewed = !!userReview;

    const totalCount = await this.prisma.review.count({
      where: { productType, productId },
    });

    if (!cursor && userReview) {
      const otherReviews = await this.prisma.review.findMany({
        where: {
          productType,
          productId,
          studentId: { not: studentId },
        },
        select: this.getReviewSelect(),
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const hasMore = otherReviews.length >= limit;
      const data = hasMore ? otherReviews.slice(0, limit - 1) : otherReviews;
      const nextCursor = data.length > 0 ? data[data.length - 1].id : null;

      return {
        data: [userReview, ...data],
        hasReviewed,
        pagination: {
          nextCursor,
          hasMore,
          totalCount,
        },
      };
    }

    const reviews = await this.prisma.review.findMany({
      where: {
        productType,
        productId,
        ...(hasReviewed && { studentId: { not: studentId } }),
      },
      select: this.getReviewSelect(),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    const hasMore = reviews.length > limit;
    const data = hasMore ? reviews.slice(0, limit) : reviews;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      hasReviewed,
      pagination: {
        nextCursor,
        hasMore,
        totalCount,
      },
    };
  }

  async addReview(studentId: number, productId: number, body: AddReviewDto) {
    await this.validateStudentProductAccess(
      studentId,
      productId,
      body.productType,
    );

    const existingReview = await this.prisma.review.findUnique({
      where: {
        studentId_productType_productId: {
          studentId,
          productType: body.productType,
          productId,
        },
      },
    });

    if (existingReview) {
      throw new ConflictException(
        body.productType === ProductType.COURSE
          ? 'لقد قمت بتقييم هذا الكورس من قبل'
          : 'لقد قمت بتقييم هذا الكتاب من قبل',
      );
    }

    const reviewData: any = {
      text: body.text,
      rating: body.rating,
      studentId,
      productType: body.productType,
      productId,
    };

    if (body.productType === ProductType.COURSE) {
      reviewData.courseId = productId;
    } else {
      reviewData.bookId = productId;
    }

    return this.prisma.review.create({
      data: reviewData,
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
        ...(body.productType === ProductType.COURSE
          ? {
              course: {
                select: {
                  id: true,
                  courseName: true,
                },
              },
            }
          : {
              book: {
                select: {
                  id: true,
                  bookName: true,
                },
              },
            }),
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
        book: true,
      },
    });

    if (!review) {
      throw new NotFoundException('التقييم غير موجود');
    }

    if (review.studentId !== studentId) {
      throw new ForbiddenException('ليس لديك صلاحية لتعديل هذا التقييم');
    }

    await this.validateStudentProductAccess(
      studentId,
      review.productId,
      review.productType,
    );

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
        ...(review.productType === ProductType.COURSE
          ? {
              course: {
                select: {
                  id: true,
                  courseName: true,
                },
              },
            }
          : {
              book: {
                select: {
                  id: true,
                  bookName: true,
                },
              },
            }),
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

  private async validateStudentProductAccess(
    studentId: number,
    productId: number,
    productType: ProductType,
  ) {
    if (productType === ProductType.COURSE) {
      const enrollment = await this.prisma.studentCourse.findUnique({
        where: {
          studentId_courseId: { studentId, courseId: productId },
        },
      });

      if (!enrollment) {
        throw new ForbiddenException('الطالب لا يملك هذا الكورس');
      }
    } else if (productType === ProductType.BOOK) {
      const bookPurchase = await this.prisma.orderItem.findFirst({
        where: {
          productId: productId,
          productType: 'BOOK',
          order: {
            studentId: studentId,
            status: 'COMPLETED',
          },
        },
      });

      if (!bookPurchase) {
        throw new ForbiddenException('الطالب لا يملك هذا الكتاب');
      }
    }
  }
}
