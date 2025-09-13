import * as ffprobe from '@ffprobe-installer/ffprobe';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import {
  CourseQueryResult,
  CourseSortBy,
  GetCoursesDto,
  SortOrder,
} from './dto/get-courses.dto';
import { Prisma } from '@prisma/client';
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
      const existingSubject = await prisma.subject.findUnique({
        where: { id: body.subjectId },
      });

      if (!existingSubject) {
        throw new NotFoundException(
          `المادة بالمعرف ${body.subjectId} غير موجودة`,
        );
      }

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
      if (updateCourseDto.subjectId) {
        const existingSubject = await prisma.subject.findUnique({
          where: { id: updateCourseDto.subjectId },
        });

        if (!existingSubject) {
          throw new NotFoundException(
            `المادة بالمعرف ${updateCourseDto.subjectId} غير موجودة`,
          );
        }
      }

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
  async getCourses(getCoursesDto: GetCoursesDto) {
    const {
      teacherId,
      gradeId,
      divisionId,
      subjectId,
      q,
      courseType,
      minPrice,
      maxPrice,
      sortBy = CourseSortBy.RATING,
      sortOrder = SortOrder.DESC,
      pageNumber = 1,
    } = getCoursesDto;

    const limit = 10;
    const offset = (pageNumber - 1) * limit;

    const whereConditions: Prisma.Sql[] = [Prisma.sql`1=1`];

    if (gradeId !== undefined)
      whereConditions.push(Prisma.sql`c."gradeId" = ${gradeId}`);
    if (divisionId !== undefined)
      whereConditions.push(Prisma.sql`c."divisionId" = ${divisionId}`);
    if (teacherId !== undefined)
      whereConditions.push(Prisma.sql`c."teacherId" = ${teacherId}`);
    if (subjectId !== undefined)
      whereConditions.push(Prisma.sql`c."subjectId" = ${subjectId}`);
    if (q?.trim())
      whereConditions.push(
        Prisma.sql`c."courseName" ILIKE ${'%' + q.trim() + '%'}`,
      );
    if (courseType !== undefined)
      whereConditions.push(Prisma.sql`c."courseType" = ${courseType}`);

    if (minPrice !== undefined)
      whereConditions.push(Prisma.sql`c.price >= ${minPrice}`);
    if (maxPrice !== undefined)
      whereConditions.push(Prisma.sql`c.price <= ${maxPrice}`);

    const finalWhereClause = Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`;

    let orderByClause: Prisma.Sql;
    switch (sortBy) {
      case CourseSortBy.RATING:
        orderByClause = Prisma.sql`COALESCE(review_stats.avg_rating, 0) ${Prisma.raw(sortOrder)}`;
        break;
      case CourseSortBy.PRICE:
        orderByClause = Prisma.sql`c.price ${Prisma.raw(sortOrder)}`;
        break;
      case CourseSortBy.STUDENTS_COUNT:
        orderByClause = Prisma.sql`COALESCE(student_count.student_count, 0) ${Prisma.raw(sortOrder)}`;
        break;
      default:
        orderByClause = Prisma.sql`COALESCE(review_stats.avg_rating, 0) ${Prisma.raw(sortOrder)}`;
    }
    const finalOrderByClause = Prisma.sql`ORDER BY ${orderByClause}, c.id`;

    const [totalResult, courses] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ total_count: bigint }[]>`
    SELECT COUNT(c.id) as "total_count"
    FROM "Course" c
    ${finalWhereClause}
  `,

      this.prisma.$queryRaw<CourseQueryResult[]>`
    SELECT 
      c.id ,
      c.thumbnail,
      c."courseName",
      c.price::float as "coursePrice",
      c."courseType",
      u."displayName" as "teacherName",
      u."profilePicture" as "teacherProfilePicture",
      u."id" as "teacherId",
      g.name as "gradeName",
      s.name as "subjectName",
      COALESCE(review_stats.review_count, 0) as "numberOfReviews",
      COALESCE(review_stats.avg_rating, 0)::float as "avgRating",
      COALESCE(lecture_count.lecture_count, 0) as "numberOfLectures",
      COALESCE(student_count.student_count, 0) as "numberOfStudents"
    FROM "Course" c
    INNER JOIN "Teacher" t ON c."teacherId" = t.id
    INNER JOIN "User" u ON t.id = u.id
    INNER JOIN "Subject" s ON c."subjectId" = s.id
    INNER JOIN "Grade" g ON c."gradeId" = g.id
    LEFT JOIN (
      SELECT 
        r."courseId",
        COUNT(*)::int as review_count,
        ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
      FROM "Review" r
      GROUP BY r."courseId"
    ) review_stats ON c.id = review_stats."courseId"
    LEFT JOIN (
      SELECT 
        cl."courseId",
        COUNT(*)::int as lecture_count
      FROM "CourseLecture" cl
      GROUP BY cl."courseId"
    ) lecture_count ON c.id = lecture_count."courseId"
    LEFT JOIN (
      SELECT 
        sc."courseId",
        COUNT(*)::int as student_count
      FROM "StudentCourse" sc
      WHERE sc."isActive" = true
      GROUP BY sc."courseId"
    ) student_count ON c.id = student_count."courseId"
    ${finalWhereClause}
    ${finalOrderByClause}
    LIMIT ${limit} OFFSET ${offset}
  `,
    ]);

    const total = Number(totalResult[0]?.total_count || 0);
    const totalPages = Math.ceil(total / limit);

    if (pageNumber !== 1 && pageNumber > totalPages) {
      throw new BadRequestException('رقم الصفحة غير صحيح');
    }
    return {
      courses,
      total,
      totalPages,
      pageNumber,
      pageSize: limit,
    };
  }
}
