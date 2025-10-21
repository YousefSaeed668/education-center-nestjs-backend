import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  private readonly COMMENTS_PER_PAGE = 10;
  private readonly REPLIES_PER_PAGE = 10;

  private validateCommentOwnership(comment: any, userId: number, role: Role) {
    const isOwner =
      (role === Role.STUDENT && comment.studentId === userId) ||
      (role === Role.TEACHER && comment.teacherId === userId);

    if (!isOwner) {
      throw new ForbiddenException('ليس لديك صلاحية لتعديل أو حذف هذا التعليق');
    }
  }

  async deleteComment(userId: number, role: Role, commentId: number) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        course: true,
        replies: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('التعليق غير موجود');
    }

    await this.validateCourseAccess(userId, role, comment.courseId);

    this.validateCommentOwnership(comment, userId, role);

    if (comment.commentImageUrl) {
      await this.s3Service.deleteFileByUrl(comment.commentImageUrl);
    }

    await this.prisma.comment.delete({
      where: { id: commentId },
    });

    return { message: 'تم حذف التعليق بنجاح' };
  }


  async updateComment(
    userId: number,
    role: Role,
    commentId: number,
    body: UpdateCommentDto,
    image?: Express.Multer.File,
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        course: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('التعليق غير موجود');
    }

    await this.validateCourseAccess(userId, role, comment.courseId);
    this.validateCommentOwnership(comment, userId, role);

    let imageUrl = comment.commentImageUrl;

    if (body.removeImage && comment.commentImageUrl) {
      await this.s3Service.deleteFileByUrl(comment.commentImageUrl);
      imageUrl = null;
    } else if (image) {
      if (comment.commentImageUrl) {
        await this.s3Service.deleteFileByUrl(comment.commentImageUrl);
      }

      const uploadResult = await this.s3Service.uploadSingleFile({
        file: image,
        isPublic: true,
        folder: `comments/${comment.courseId}`,
      });
      imageUrl = uploadResult?.url;
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: {
        ...(body.text && { text: body.text }),
        ...(body.removeImage !== undefined || image
          ? { commentImageUrl: imageUrl }
          : {}),
      },
      include: {
        student: true,
        teacher: true,
        parentComment: {
          include: {
            student: true,
            teacher: true,
          },
        },
      },
    });
  }

  async addComment(
    userId: number,
    role: Role,
    courseId: number,
    body: AddCommentDto,
    image?: Express.Multer.File,
  ) {
    await this.validateCourseAccess(userId, role, courseId);
    const imageUrl = image
      ? await this.s3Service.uploadSingleFile({
          file: image,
          isPublic: true,
          folder: `comments/${courseId}`,
        })
      : null;
    if (body.parentCommentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: {
          id: body.parentCommentId,
        },
      });
      if (!parentComment) {
        throw new ForbiddenException('التعليق الرئيسي غير موجود');
      }
    }
    await this.prisma.comment.create({
      data: {
        text: body.text,
        commentImageUrl: imageUrl?.url,
        ...(role === Role.STUDENT && { studentId: userId }),
        ...(role === Role.TEACHER && { teacherId: userId }),
        courseId: courseId,
        ...(body.parentCommentId && { parentCommentId: body.parentCommentId }),
      },
    });
  }

  private async validateCourseAccess(
    userId: number,
    role: Role,
    courseId: number,
  ) {
    if (role === Role.STUDENT) {
      const enrollment = await this.prisma.studentCourse.findUnique({
        where: {
          studentId_courseId: { studentId: userId, courseId },
        },
      });
      if (!enrollment) {
        throw new ForbiddenException('الطالب لا يملك هذا الكورس');
      }
    } else if (role === Role.TEACHER) {
      const course = await this.prisma.course.findFirst({
        where: { id: courseId, teacherId: userId },
      });
      if (!course) {
        throw new ForbiddenException('المعلم لا يملك هذا الكورس');
      }
    }
  }

  async getByCourseId(courseId: number, cursor?: number) {
    const limit = this.COMMENTS_PER_PAGE;

    const totalCount = await this.prisma.comment.count({
      where: { courseId: courseId, parentCommentId: null },
    });

    const comments = await this.prisma.comment.findMany({
      where: { courseId: courseId, parentCommentId: null },
      ...this.getCommentIncludes(),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    const hasMore = comments.length > limit;

    const data = hasMore ? comments.slice(0, limit) : comments;

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

  async getCommentReplies(commentId: number, cursor?: number) {
    const limit = this.REPLIES_PER_PAGE;

    const totalCount = await this.prisma.comment.count({
      where: { parentCommentId: commentId },
    });

    const replies = await this.prisma.comment.findMany({
      where: { parentCommentId: commentId },
      ...this.getCommentIncludes(),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    const hasMore = replies.length > limit;

    const data = hasMore ? replies.slice(0, limit) : replies;

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

  private getCommentIncludes() {
    return {
      include: {
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
        teacher: {
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
        _count: {
          select: { replies: true },
        },
      },
    };
  }
}
