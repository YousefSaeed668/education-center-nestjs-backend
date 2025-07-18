import * as ffprobe from '@ffprobe-installer/ffprobe';
import { Injectable, NotFoundException } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
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
}
