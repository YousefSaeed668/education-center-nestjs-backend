import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { S3Service } from 'src/s3/s3.service';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffprobe from '@ffprobe-installer/ffprobe';
import { Readable } from 'stream';
import { PrismaService } from 'src/prisma.service';
import { ImageService } from 'src/common/services/image.service';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { UpdateLectureDto } from 'src/lecture/dto/update-lecture.dto';
import { CreateLectureDto } from 'src/lecture/dto/create-lecture.dto';
import { CourseType } from '@prisma/client';
ffmpeg.setFfprobePath(ffprobe.path);
@Injectable()
export class CourseService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly imageService: ImageService,
    private readonly handleFiles: HandleFiles,
  ) {}

  async createCourse(
    teacherId: number,
    body: CreateCourseDto,
    thumbnail: Express.Multer.File,
  ) {
    const { lectureIds, ...rest } = body;

    return await this.prisma.$transaction(async (prisma) => {
      const existingLectures = await prisma.lecture.findMany({
        where: {
          id: { in: lectureIds },
          teacherId: teacherId,
        },
      });

      if (existingLectures.length !== lectureIds.length) {
        const foundIds = existingLectures.map((lecture) => lecture.id);
        const missingIds = lectureIds.filter((id) => !foundIds.includes(id));
        throw new NotFoundException(
          `المحاضرات بالمعرفات ${missingIds.join(', ')} غير موجودة`,
        );
      }

      const compressedThumbnail = await this.imageService.compressImage(
        thumbnail,
        {},
        80,
      );

      const { url } = await this.s3Service.uploadSingleFile({
        file: compressedThumbnail,
        isPublic: true,
        folder: `courses/teacher-${teacherId}/${this.handleFiles.sanitizeFileName(body.courseName)}`,
      });

      const course = await prisma.course.create({
        data: {
          ...rest,
          teacherId: teacherId,
          thumbnail: url,
        },
      });

      await prisma.courseLecture.createMany({
        data: lectureIds.map((lectureId, index) => ({
          courseId: course.id,
          lectureId: lectureId,
          orderIndex: index,
        })),
      });

      return course;
    });
  }

  async deleteLecture(teacherId: number, lectureId: number) {
    return await this.prisma.$transaction(async (prisma) => {
      const existingLecture = await prisma.lecture.findUnique({
        where: {
          id: lectureId,
          teacherId: teacherId,
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
          await this.s3Service.deleteFileByUrl(content.contentUrl);
        }),
      );
      const coursesToDelete = existingLecture.CourseLecture.filter(
        (courseLecture) => courseLecture.course._count.CourseLecture === 1,
      ).map((courseLecture) => courseLecture.course.id);

      if (coursesToDelete.length > 0) {
        await prisma.course.deleteMany({
          where: {
            id: { in: coursesToDelete },
          },
        });
      }

      await prisma.lecture.delete({
        where: { id: lectureId },
      });
    });
  }

  async deleteCourse(teacherId: number, courseId: number) {
    return await this.prisma.$transaction(async (prisma) => {
      const existingCourse = await prisma.course.findFirst({
        where: {
          id: courseId,
          teacherId: teacherId,
        },
      });

      if (!existingCourse) {
        throw new NotFoundException(
          'الدورة غير موجودة أو ليس لديك صلاحية لحذفها',
        );
      }

      if (existingCourse.thumbnail) {
        await this.s3Service.deleteFileByUrl(existingCourse.thumbnail);
      }

      await prisma.courseLecture.deleteMany({
        where: {
          courseId: courseId,
        },
      });

      await prisma.course.delete({
        where: {
          id: courseId,
        },
      });
    });
  }

  async updateLecture(
    teacherId: number,
    lectureId: number,
    updateLectureDto: UpdateLectureDto,
    newFiles?: Express.Multer.File[],
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
      const basicUpdateData = {
        ...(updateLectureDto.lectureName && {
          lectureName: updateLectureDto.lectureName,
        }),
        ...(updateLectureDto.gradeId && { gradeId: updateLectureDto.gradeId }),
        ...(updateLectureDto.divisionId && {
          divisionId: updateLectureDto.divisionId,
        }),
      };
      if (Object.keys(basicUpdateData).length > 0) {
        await prisma.lecture.update({
          where: { id: lectureId },
          data: basicUpdateData,
        });
      }

      if (
        updateLectureDto.deletedContentIds &&
        updateLectureDto.deletedContentIds.length > 0
      ) {
        const contentToDelete = await prisma.lectureContent.findMany({
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
            lectureId: lectureId,
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

        if (existingContentUpdates.length > 0) {
          await Promise.all(
            existingContentUpdates.map((contentUpdate) =>
              prisma.lectureContent.update({
                where: {
                  id: contentUpdate.id,
                  lectureId: lectureId,
                },
                data: {
                  contentName: contentUpdate.contentName,
                  orderIndex: contentUpdate.orderIndex,
                },
              }),
            ),
          );
        }

        if (newContentData.length > 0) {
          if (!newFiles || newFiles.length !== newContentData.length) {
            throw new BadRequestException(
              'عدد عناصر المحتوى الجديدة يجب أن يطابق عدد الملفات الجديدة',
            );
          }
          const handleFiles = await this.uploadLectureFiles(
            `courses/teacher-${teacherId}/${this.handleFiles.sanitizeFileName(existingLecture.lectureName)}`,
            newFiles,
          );
          const newContentEntries = newContentData.map((content, index) => ({
            lectureId: lectureId,
            contentName: content.contentName,
            orderIndex: content.orderIndex,
            contentUrl: handleFiles[index].contentUrl,
            contentType: handleFiles[index].contentType,
            ...(handleFiles[index].duration && {
              duration: Number(handleFiles[index].duration),
            }),
          }));
          await prisma.lectureContent.createMany({
            data: newContentEntries,
          });
        }
      }

      if (updateLectureDto.gradeId || updateLectureDto.divisionId) {
        const coursesToUpdate = existingLecture.CourseLecture.filter(
          (courseLecture) => courseLecture.course._count.CourseLecture === 1,
        ).map((courseLecture) => courseLecture.course.id);

        if (coursesToUpdate.length > 0) {
          const courseUpdateData: { gradeId?: number; divisionId?: number } =
            {};

          if (updateLectureDto.gradeId) {
            courseUpdateData.gradeId = updateLectureDto.gradeId;
          }

          if (updateLectureDto.divisionId) {
            courseUpdateData.divisionId = updateLectureDto.divisionId;
          }

          await prisma.course.updateMany({
            where: { id: { in: coursesToUpdate } },
            data: courseUpdateData,
          });
        }
      }
    });
  }

  async updateCourse(
    teacherId: number,
    courseId: number,
    updateCourseDto: UpdateCourseDto,
    thumbnail?: Express.Multer.File,
  ) {
    return await this.prisma.$transaction(async (prisma) => {
      const existingCourse = await prisma.course.findFirst({
        where: {
          id: courseId,
          teacherId: teacherId,
        },
        include: {
          _count: {
            select: {
              CourseLecture: true,
            },
          },
        },
      });

      if (!existingCourse) {
        throw new NotFoundException(
          'الدورة غير موجودة أو ليس لديك صلاحية لتعديلها',
        );
      }

      const filteredData = Object.fromEntries(
        Object.entries(updateCourseDto).filter(
          ([, value]) => value !== undefined,
        ),
      );

      if (thumbnail) {
        if (existingCourse.thumbnail) {
          await this.s3Service.deleteFileByUrl(existingCourse.thumbnail);
        }
        const compressedThumbnail = await this.imageService.compressImage(
          thumbnail,
          {},
          70,
        );
        const thumbnailUrl = await this.s3Service.uploadSingleFile({
          file: compressedThumbnail,
          isPublic: true,
          folder: `courses/teacher-${teacherId}/${this.handleFiles.sanitizeFileName(existingCourse.courseName)}`,
        });
        filteredData.thumbnail = thumbnailUrl.url;
      }

      await prisma.course.update({
        where: { id: courseId },
        data: filteredData,
      });

      if (
        existingCourse._count.CourseLecture == 1 &&
        (updateCourseDto.gradeId || updateCourseDto.divisionId)
      ) {
        const courseLecture = await prisma.courseLecture.findFirst({
          where: {
            courseId,
          },
        });
        if (courseLecture) {
          const lectureUpdateData: { gradeId?: number; divisionId?: number } =
            {};
          if (updateCourseDto.gradeId) {
            lectureUpdateData.gradeId = updateCourseDto.gradeId;
          }

          if (updateCourseDto.divisionId) {
            lectureUpdateData.divisionId = updateCourseDto.divisionId;
          }
          await prisma.lecture.update({
            where: { id: courseLecture.lectureId },
            data: lectureUpdateData,
          });
        }
      }
    });
  }

  async createLecture(
    teacherId: number,
    createLectureDto: CreateLectureDto,
    files: Express.Multer.File[],
    thumbnail?: Express.Multer.File,
  ) {
    const {
      isSellable,
      lectureContents: bodyLectureContents,
      description,
      courseFeatures,
      orderIndex,
      price,
      divisionId,
      gradeId,
      lectureName,
    } = createLectureDto;

    if (isSellable && !thumbnail) {
      throw new BadRequestException(
        'الصورة المصغرة مطلوبة عندما تكون المحاضرة قابلة للبيع',
      );
    }
    if (bodyLectureContents.length !== files.length) {
      throw new BadRequestException(
        'عدد محتويات المحاضرة يجب أن يطابق عدد الملفات',
      );
    }

    const handleFiles = await this.uploadLectureFiles(
      `courses/teacher-${teacherId}/${lectureName}`,
      files,
    );

    const lectureContents = bodyLectureContents.map((content, index) => ({
      ...content,
      contentUrl: handleFiles[index].contentUrl,
      contentType: handleFiles[index].contentType,
      ...(handleFiles[index].duration && {
        duration: Number(handleFiles[index].duration),
      }),
    }));

    return await this.prisma.$transaction(async (prisma) => {
      const lecture = await prisma.lecture.create({
        data: {
          lectureName,
          divisionId,
          gradeId,
          teacherId: teacherId,
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
          folder: `courses/teacher-${teacherId}/${lectureName}`,
        });

        const course = await prisma.course.create({
          data: {
            courseName: lectureName,
            description: description,
            courseType: CourseType.حصة,
            price: price,
            teacherId: teacherId,
            gradeId: gradeId,
            divisionId: divisionId,
            thumbnail: thumbnailUrl.url,
            courseFeatures,
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

  private getContentType(mimeType: string): 'FILE' | 'VIDEO' {
    const videoMimeTypes = /^video\/(mp4|mpeg|quicktime|x-msvideo|webm)$/;
    const fileMimeTypes = [
      /^application\/pdf$/,
      /^application\/msword$/,
      /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
      /^application\/vnd\.ms-excel$/,
      /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/,
    ];
    if (videoMimeTypes.test(mimeType)) {
      return 'VIDEO';
    }

    if (fileMimeTypes.some((pattern) => pattern.test(mimeType))) {
      return 'FILE';
    }
    throw new BadRequestException(
      `نوع ملف غير مدعوم: ${mimeType}. يُسمح فقط بملفات الفيديو وأنواع ملفات محددة.`,
    );
  }

  private async getVideoDuration(file: Express.Multer.File): Promise<number> {
    return new Promise((resolve, reject) => {
      const readableStream = Readable.from(file.buffer);
      ffmpeg(readableStream).ffprobe((err, data) => {
        if (err) {
          reject(new BadRequestException('لا يمكن الحصول على مدة الفيديو.'));
          return;
        }
        resolve(Number(data.format.duration.toFixed(2)));
      });
    });
  }

  uploadLectureFiles(path: string, files: Express.Multer.File[]) {
    return Promise.all(
      files.map(async (file) => {
        const contentType = this.getContentType(file.mimetype);
        const { url: contentUrl } = await this.s3Service.uploadSingleFile({
          file,
          isPublic: true,
          folder: path,
        });
        if (contentType === 'VIDEO') {
          const duration = await this.getVideoDuration(file);
          return {
            contentUrl,
            contentType,
            duration,
          };
        }

        return {
          contentUrl,
          contentType,
          duration: null,
        };
      }),
    );
  }
}
