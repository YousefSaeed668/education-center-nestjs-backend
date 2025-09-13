import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { S3Service } from 'src/s3/s3.service';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffprobe from '@ffprobe-installer/ffprobe';
import { Readable } from 'stream';
import { PrismaService } from 'src/prisma.service';
import { ImageService } from 'src/common/services/image.service';
import { UpdateLectureDto } from './dto/update-lecture.dto';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { CourseType } from '@prisma/client';

ffmpeg.setFfprobePath(ffprobe.path);

@Injectable()
export class LectureService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly imageService: ImageService,
    private readonly handleFiles: HandleFiles,
  ) {}

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
      subjectId,
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

      if (isSellable && thumbnail && subjectId) {
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
            subjectId,
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

      await prisma.lecture.update({
        where: { id: lectureId },
        data: basicUpdateData,
      });

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

        if (newContentData.length > 0 && newFiles && newFiles.length > 0) {
          if (newContentData.length !== newFiles.length) {
            throw new BadRequestException(
              'عدد محتويات المحاضرة الجديدة يجب أن يطابق عدد الملفات الجديدة',
            );
          }

          const uploadedFiles = await this.uploadLectureFiles(
            `courses/teacher-${teacherId}/${existingLecture.lectureName}`,
            newFiles,
          );

          const newContents = newContentData.map((content, index) => ({
            ...content,
            contentUrl: uploadedFiles[index].contentUrl,
            contentType: uploadedFiles[index].contentType,
            lectureId: lectureId,
            ...(uploadedFiles[index].duration && {
              duration: Number(uploadedFiles[index].duration),
            }),
          }));

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

      if (updateLectureDto.gradeId || updateLectureDto.divisionId) {
        const coursesToUpdate = existingLecture.CourseLecture.filter(
          (courseLecture) =>
            courseLecture.course.courseType === 'حصة' &&
            courseLecture.course._count.CourseLecture === 1,
        ).map((courseLecture) => courseLecture.course.id);

        if (coursesToUpdate.length > 0) {
          const updateData: { gradeId?: number; divisionId?: number } = {};
          if (updateLectureDto.gradeId) {
            updateData.gradeId = updateLectureDto.gradeId;
          }
          if (updateLectureDto.divisionId) {
            updateData.divisionId = updateLectureDto.divisionId;
          }

          await prisma.course.updateMany({
            where: { id: { in: coursesToUpdate } },
            data: updateData,
          });
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
      const existingLecture = await prisma.lecture.findUnique({
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
