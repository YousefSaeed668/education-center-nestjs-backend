import * as ffprobe from '@ffprobe-installer/ffprobe';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseType } from '@prisma/client';
import * as ffmpeg from 'fluent-ffmpeg';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { v4 as uuidv4 } from 'uuid';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { GenerateUploadUrlsDto } from './dto/generate-upload-urls.dto';
import {
  GetTeacherLecturesDto,
  LecturesSortBy,
} from './dto/get-teacher-lectures.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';
ffmpeg.setFfprobePath(ffprobe.path);

@Injectable()
export class LectureService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly imageService: ImageService,
    private readonly handleFiles: HandleFiles,
  ) {}
  async generateUploadUrls(
    teacherId: number,
    generateUploadUrlsDto: GenerateUploadUrlsDto,
  ) {
    const { lectureName, files } = generateUploadUrlsDto;
    const sanitizedLectureName = this.sanitizeFolderName(lectureName);

    const uploadUrls = await Promise.all(
      files.map(async (file) => {
        const fileExtension = file.fileName.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExtension}`;
        const s3Key = `courses/teacher-${teacherId}/${sanitizedLectureName}/${uniqueFileName}`;
        const uploadUrl = await this.s3Service.generatePresignedUploadUrl(
          s3Key,
          file.contentType,
          3600,
          file.size,
        );

        return {
          fileName: file.fileName,
          uploadUrl,
          s3Key,
          contentType: file.contentType,
        };
      }),
    );

    return {
      uploadUrls,
      expiresIn: 3600,
    };
  }

  async generateUploadUrlsForUpdate(
    teacherId: number,
    lectureId: number,
    files: GenerateUploadUrlsDto['files'],
  ) {
    const lecture = await this.prisma.lecture.findFirst({
      where: {
        id: lectureId,
        teacherId: teacherId,
      },
    });

    if (!lecture) {
      throw new NotFoundException(
        'المحاضرة غير موجودة أو ليس لديك صلاحية للوصول إليها',
      );
    }
    const sanitizedLectureName = this.sanitizeFolderName(lecture.lectureName);

    const uploadUrls = await Promise.all(
      files.map(async (file) => {
        const fileExtension = file.fileName.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExtension}`;
        const s3Key = `courses/teacher-${teacherId}/${sanitizedLectureName}/${uniqueFileName}`;
        const maxSizeWithOverhead = file.size + 300 * 1024;
        const uploadUrl = await this.s3Service.generatePresignedUploadUrl(
          s3Key,
          file.contentType,
          3600,
          maxSizeWithOverhead,
        );

        return {
          fileName: file.fileName,
          uploadUrl,
          s3Key,
          contentType: file.contentType,
        };
      }),
    );

    return {
      uploadUrls,
      expiresIn: 3600,
    };
  }
  async createLecture(
    teacherId: number,
    createLectureDto: CreateLectureDto,
    thumbnail?: Express.Multer.File,
  ) {
    const {
      isSellable,
      lectureContents: bodyLectureContents,
      description,
      courseFeatures,
      orderIndex,
      price,
      divisionIds,
      gradeId,
      lectureName,
    } = createLectureDto;
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { subjectId: true },
    });
    if (!teacher || !teacher.subjectId) {
      throw new BadRequestException(
        'المعلم غير موجود أو غير مرتبط بأي مادة دراسية. لا يمكن إنشاء محاضرة.',
      );
    }
    const subjectId: number = teacher.subjectId;
    const sanitizedLectureName = this.sanitizeFolderName(lectureName);

    if (isSellable && !thumbnail) {
      throw new BadRequestException(
        'الصورة المصغرة مطلوبة عندما تكون المحاضرة قابلة للبيع',
      );
    }

    const lectureContents = await Promise.all(
      bodyLectureContents.map(async (content) => {
        const fileExists = await this.s3Service.checkFileExists(content.s3Key);
        if (!fileExists) {
          throw new BadRequestException(
            `الملف بالمفتاح ${content.s3Key} غير موجود في S3`,
          );
        }

        const contentType = this.getContentTypeFromS3Key(content.s3Key);
        const contentUrl = this.s3Service.getFileUrl(content.s3Key).url;

        let duration: number | undefined;
        if (contentType === 'VIDEO') {
          duration = await this.getVideoDurationFromS3(content.s3Key);
        }

        return {
          contentName: content.contentName,
          orderIndex: content.orderIndex,
          contentUrl,
          contentType,
          ...(duration && { duration: Number(duration) }),
        };
      }),
    );

    return await this.prisma.$transaction(async (prisma) => {
      const lecture = await prisma.lecture.create({
        data: {
          lectureName,
          gradeId,
          teacherId: teacherId,
          Division: {
            connect: divisionIds.map((id) => ({ id })),
          },
          LectureContent: {
            createMany: {
              data: lectureContents,
            },
          },
        },
      });

      if (isSellable && thumbnail) {
        const compressedThumbnail = await this.imageService.compressImage(
          thumbnail,
          {},
          70,
        );
        const thumbnailUrl = await this.s3Service.uploadSingleFile({
          file: compressedThumbnail,
          isPublic: true,
          folder: `courses/teacher-${teacherId}/${sanitizedLectureName}`,
        });
        const course = await prisma.course.create({
          data: {
            courseName: lectureName,
            description: description,
            courseType: CourseType.حصة,
            price: price,
            teacherId: teacherId,
            gradeId: gradeId,
            thumbnail: thumbnailUrl.url,
            courseFeatures,
            subjectId,
            Division: {
              connect: divisionIds.map((id) => ({ id })),
            },
          },
        });

        await prisma.courseLecture.create({
          data: {
            courseId: course.id,
            lectureId: lecture.id,
            orderIndex: orderIndex,
          },
        });
      }

      return lecture;
    });
  }

  async updateLecture(
    teacherId: number,
    lectureId: number,
    updateLectureDto: UpdateLectureDto,
  ) {
    const existingLecture = await this.prisma.lecture.findFirst({
      where: {
        id: lectureId,
        teacherId: teacherId,
      },
      include: {
        CourseLecture: {
          include: {
            course: {
              include: {
                _count: {
                  select: {
                    CourseLecture: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!existingLecture) {
      throw new NotFoundException(
        'المحاضرة غير موجودة أو ليس لديك صلاحية لتعديلها',
      );
    }

    return await this.prisma.$transaction(async (prisma) => {
      const basicUpdateData: any = {
        ...(updateLectureDto.lectureName && {
          lectureName: updateLectureDto.lectureName,
        }),
        ...(updateLectureDto.gradeId && { gradeId: updateLectureDto.gradeId }),
      };

      if (
        updateLectureDto.divisionIds &&
        updateLectureDto.divisionIds.length > 0
      ) {
        basicUpdateData.Division = {
          set: updateLectureDto.divisionIds.map((id) => ({ id })),
        };
      }

      await prisma.lecture.update({
        where: { id: lectureId },
        data: basicUpdateData,
      });

      if (
        updateLectureDto.deletedContentIds &&
        updateLectureDto.deletedContentIds.length > 0
      ) {
        const contentToDelete = await prisma.lectureContent.findMany({
          select: { contentUrl: true },
          where: {
            id: { in: updateLectureDto.deletedContentIds },
            lectureId: lectureId,
          },
        });

        await Promise.all(
          contentToDelete.map(async (content) => {
            await this.s3Service.deleteFileByUrl(content.contentUrl);
          }),
        );

        await prisma.lectureContent.deleteMany({
          where: {
            id: { in: updateLectureDto.deletedContentIds },
          },
        });
      }

      if (
        updateLectureDto.lectureContents &&
        updateLectureDto.lectureContents?.length > 0
      ) {
        const existingContentUpdates = updateLectureDto.lectureContents.filter(
          (content) => content.id,
        );
        const newContentData = updateLectureDto.lectureContents.filter(
          (content) => !content.id,
        );

        if (newContentData.length > 0) {
          const newContents = await Promise.all(
            newContentData.map(async (content) => {
              const fileExists = await this.s3Service.checkFileExists(
                content.s3Key,
              );
              if (!fileExists) {
                throw new BadRequestException(
                  `الملف بالمفتاح ${content.s3Key} غير موجود في S3`,
                );
              }

              const contentType = this.getContentTypeFromS3Key(content.s3Key);
              const contentUrl = this.s3Service.getFileUrl(content.s3Key).url;

              let duration: number | undefined;
              if (contentType === 'VIDEO') {
                duration = await this.getVideoDurationFromS3(content.s3Key);
              }

              return {
                contentName: content.contentName,
                orderIndex: content.orderIndex,
                contentUrl,
                contentType,
                lectureId: lectureId,
                ...(duration && { duration: Number(duration) }),
              };
            }),
          );

          await prisma.lectureContent.createMany({
            data: newContents,
          });
        }

        for (const content of existingContentUpdates) {
          await prisma.lectureContent.update({
            where: { id: content.id },
            data: {
              contentName: content.contentName,
              orderIndex: content.orderIndex,
            },
          });
        }
      }

      if (updateLectureDto.gradeId || updateLectureDto.divisionIds) {
        const coursesToUpdate = existingLecture.CourseLecture.filter(
          (courseLecture) =>
            courseLecture.course.courseType === 'حصة' &&
            courseLecture.course._count.CourseLecture === 1,
        ).map((courseLecture) => courseLecture.course.id);

        if (coursesToUpdate.length > 0) {
          for (const courseId of coursesToUpdate) {
            const updateData: any = {};
            if (updateLectureDto.gradeId) {
              updateData.gradeId = updateLectureDto.gradeId;
            }
            if (
              updateLectureDto.divisionIds &&
              updateLectureDto.divisionIds.length > 0
            ) {
              updateData.Division = {
                set: updateLectureDto.divisionIds.map((id) => ({ id })),
              };
            }

            await prisma.course.update({
              where: { id: courseId },
              data: updateData,
            });
          }
        }
      }

      return await prisma.lecture.findUnique({
        where: { id: lectureId },
        include: {
          LectureContent: true,
        },
      });
    });
  }

  async deleteLecture(teacherId: number, lectureId: number) {
    return await this.prisma.$transaction(async (prisma) => {
      const existingLecture = await prisma.lecture.findFirst({
        where: {
          id: lectureId,
          teacherId,
        },
        include: {
          LectureContent: true,
          CourseLecture: {
            include: {
              course: {
                include: {
                  _count: {
                    select: {
                      CourseLecture: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existingLecture) {
        throw new NotFoundException(
          'المحاضرة غير موجودة أو ليس لديك صلاحية لحذفها',
        );
      }

      await Promise.all(
        existingLecture.LectureContent.map(async (content) => {
          try {
            await this.s3Service.deleteFileByUrl(content.contentUrl);
          } catch (error) {
            console.error(
              `Failed to delete S3 file: ${content.contentUrl}`,
              error,
            );
          }
        }),
      );

      const coursesToDelete = existingLecture.CourseLecture.filter(
        (courseLecture) => courseLecture.course._count.CourseLecture === 1,
      ).map((courseLecture) => courseLecture.course);

      if (coursesToDelete.length > 0) {
        await Promise.all(
          coursesToDelete.map(async (course) => {
            try {
              await this.s3Service.deleteFileByUrl(course.thumbnail);
            } catch (error) {
              console.error(
                `Failed to delete course thumbnail: ${course.thumbnail}`,
                error,
              );
            }
          }),
        );

        const courseIds = coursesToDelete.map((course) => course.id);

        await prisma.courseLecture.deleteMany({
          where: {
            courseId: { in: courseIds },
          },
        });

        await prisma.course.deleteMany({
          where: {
            id: { in: courseIds },
          },
        });
      }

      await prisma.lecture.delete({
        where: { id: lectureId },
      });

      return {
        success: true,
        message: 'تم حذف المحاضرة بنجاح',
      };
    });
  }
  private sanitizeFolderName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-أ-ي]/g, '')
      .toLowerCase();
  }
  private getContentTypeFromS3Key(s3Key: string): 'FILE' | 'VIDEO' {
    const extension = s3Key.split('.').pop()?.toLowerCase();

    const videoExtensions = ['mp4', 'mpeg', 'mov', 'avi', 'webm'];
    const fileExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];

    if (videoExtensions.includes(extension || '')) {
      return 'VIDEO';
    }

    if (fileExtensions.includes(extension || '')) {
      return 'FILE';
    }

    throw new BadRequestException(
      `نوع ملف غير مدعوم بناءً على الامتداد: ${extension}`,
    );
  }
  private async getVideoDurationFromS3(s3Key: string): Promise<number> {
    try {
      const stream = await this.s3Service.getFileStream(s3Key);

      return new Promise((resolve, reject) => {
        ffmpeg(stream).ffprobe((err, data) => {
          if (err) {
            reject(new BadRequestException('لا يمكن الحصول على مدة الفيديو.'));
          } else {
            resolve(Number(data.format.duration.toFixed(2)));
          }
        });
      });
    } catch {
      throw new BadRequestException('فشل في قراءة الملف من S3.');
    }
  }
  async getLectureDataForUpdate(teacherId: number, lectureId: number) {
    const lecture = await this.prisma.lecture.findUnique({
      where: {
        id: lectureId,
        teacherId,
      },
      select: {
        lectureName: true,
        Division: {
          select: {
            id: true,
          },
        },
        gradeId: true,
        LectureContent: {
          select: {
            contentName: true,
            id: true,
            orderIndex: true,
            contentType: true,
          },
        },
      },
    });
    if (!lecture) {
      throw new NotFoundException(
        'المحاضرة غير موجودة أو ليس لديك صلاحية للوصول إليها',
      );
    }
    const {
      lectureName,
      Division: divisionIds,
      gradeId,
      LectureContent: lectureContents,
    } = lecture;
    return {
      lectureName,
      divisionIds: divisionIds.map((div) => div.id),
      gradeId,
      lectureContents: lectureContents.sort(
        (a, b) => a.orderIndex - b.orderIndex,
      ),
    };
  }

  async getLecturesForTeacher(teacherId: number, query: GetTeacherLecturesDto) {
    const {
      sortBy,
      sortOrder,
      pageNumber,
      pageSize,
      q,
      hasQuiz,
      usedInCourses,
    } = query;

    const skip =
      pageNumber && pageSize ? (pageNumber - 1) * pageSize : undefined;
    const take = pageSize ? pageSize : 20;
    let orderBy: any = {};

    const whereClause: any = {
      teacherId,
    };

    if (q) {
      whereClause.lectureName = {
        contains: q,
        mode: 'insensitive',
      };
    }

    if (hasQuiz !== undefined) {
      whereClause.Quiz = hasQuiz === 'true' ? { some: {} } : { none: {} };
    }

    if (usedInCourses !== undefined) {
      whereClause.CourseLecture =
        usedInCourses === 'true' ? { some: {} } : { none: {} };
    }

    if (sortBy) {
      const order = sortOrder ? sortOrder.toLowerCase() : 'desc';

      switch (sortBy) {
        case LecturesSortBy.CREATED_AT:
          orderBy = { createdAt: order };
          break;
        case LecturesSortBy.LECTURE_NAME:
          orderBy = { lectureName: order };
          break;
        case LecturesSortBy.COURSE_LECTURE:
          orderBy = { CourseLecture: { _count: order } };
          break;
        case LecturesSortBy.LECTURE_CONTENT:
          orderBy = { LectureContent: { _count: order } };
          break;
        case LecturesSortBy.QUIZ:
          orderBy = { Quiz: { _count: order } };
          break;
      }
    } else {
      orderBy = { createdAt: 'desc' };
    }

    const [lectures, total] = await Promise.all([
      this.prisma.lecture.findMany({
        where: whereClause,
        select: {
          id: true,
          createdAt: true,
          lectureName: true,
          _count: {
            select: {
              LectureContent: true,
              CourseLecture: true,
              Quiz: true,
            },
          },
          Grade: {
            select: {
              name: true,
              id: true,
            },
          },
          Division: {
            select: {
              name: true,
              id: true,
            },
          },
        },
        orderBy,
        skip,
        take,
      }),
      this.prisma.lecture.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(total / (pageSize || 20));
    return {
      lectures,
      total,
      totalPages,
      pageNumber,
      pageSize: pageSize || 20,
    };
  }
}
