import * as ffprobe from '@ffprobe-installer/ffprobe';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentType, Prisma } from '@prisma/client';
import * as ffmpeg from 'fluent-ffmpeg';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateCourseDto } from './dto/create-course.dto';
import {
  CourseQueryResult,
  CourseRow,
  CourseSortBy,
  GetCoursesDto,
  SortOrder,
} from './dto/get-courses.dto';
import {
  GetTeacherCoursesDto,
  TeacherCourseQueryResult,
  TeacherCourseSortBy,
  SortOrder as TeacherSortOrder,
} from './dto/get-teacher-courses.dto';
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
    const { lectureIds, divisionIds, ...rest } = body;

    return await this.prisma.$transaction(async (prisma) => {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { subjectId: true },
      });

      if (!teacher || !teacher.subjectId) {
        throw new NotFoundException('المعلم غير موجود أو لا يحتوي على مادة');
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
        folder: `courses/teacher-${teacherId}/${this.handleFiles.sanitizeFileName(
          body.courseName,
        )}`,
      });

      const course = await prisma.course.create({
        data: {
          ...rest,
          teacherId: teacherId,
          subjectId: teacher.subjectId,
          thumbnail: url,
          Division: {
            connect: divisionIds.map((id) => ({ id })),
          },
        },
      });

      await prisma.courseLecture.createMany({
        data: lectureIds.map((lectureId, index) => ({
          courseId: course.id,
          lectureId: lectureId,
          orderIndex: index,
        })),
      });

      return {
        courseId: course.id,
      };
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

      if (updateCourseDto.lectureIds && updateCourseDto.lectureIds.length > 0) {
        const uniqueLectureIds = new Set(updateCourseDto.lectureIds);
        if (uniqueLectureIds.size !== updateCourseDto.lectureIds.length) {
          throw new BadRequestException('يوجد تكرار في معرفات المحاضرات');
        }

        const existingCourseLectures = await prisma.courseLecture.findMany({
          where: {
            courseId: courseId,
          },
          select: {
            lectureId: true,
          },
        });

        const existingLectureIds = existingCourseLectures.map(
          (cl) => cl.lectureId,
        );

        const lecturesToAdd = updateCourseDto.lectureIds.filter(
          (id) => !existingLectureIds.includes(id),
        );

        if (lecturesToAdd.length > 0) {
          const newLectures = await prisma.lecture.findMany({
            where: {
              id: { in: lecturesToAdd },
              teacherId: teacherId,
            },
          });

          if (newLectures.length !== lecturesToAdd.length) {
            throw new NotFoundException(
              'بعض المحاضرات الجديدة غير موجودة أو لا تنتمي لك',
            );
          }
        }

        const remainingLectureIds = updateCourseDto.lectureIds.filter((id) =>
          existingLectureIds.includes(id),
        );
        if (remainingLectureIds.length > 0) {
          const remainingLectures = await prisma.lecture.findMany({
            where: {
              id: { in: remainingLectureIds },
              teacherId: teacherId,
            },
          });

          if (remainingLectures.length !== remainingLectureIds.length) {
            throw new NotFoundException(
              'بعض المحاضرات غير موجودة أو لا تنتمي لك',
            );
          }
        }

        await prisma.courseLecture.deleteMany({
          where: {
            courseId: courseId,
          },
        });

        await prisma.courseLecture.createMany({
          data: updateCourseDto.lectureIds.map((lectureId, index) => ({
            courseId: courseId,
            lectureId: lectureId,
            orderIndex: index + 1,
          })),
        });
      }

      const filteredData: any = Object.fromEntries(
        Object.entries(updateCourseDto).filter(
          ([key, value]) =>
            value !== undefined &&
            key !== 'divisionIds' &&
            key !== 'lectureIds',
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
          folder: `courses/teacher-${teacherId}/${this.handleFiles.sanitizeFileName(
            existingCourse.courseName,
          )}`,
        });
        filteredData.thumbnail = thumbnailUrl.url;
      }

      if (
        updateCourseDto.divisionIds &&
        updateCourseDto.divisionIds.length > 0
      ) {
        filteredData.Division = {
          set: updateCourseDto.divisionIds.map((id) => ({ id })),
        };
      }

      await prisma.course.update({
        where: { id: courseId },
        data: filteredData,
      });

      if (
        existingCourse._count.CourseLecture == 1 &&
        (updateCourseDto.gradeId || updateCourseDto.divisionIds)
      ) {
        const courseLecture = await prisma.courseLecture.findFirst({
          where: {
            courseId,
          },
        });
        if (courseLecture) {
          const lectureUpdateData: any = {};
          if (updateCourseDto.gradeId) {
            lectureUpdateData.gradeId = updateCourseDto.gradeId;
          }

          if (
            updateCourseDto.divisionIds &&
            updateCourseDto.divisionIds.length > 0
          ) {
            lectureUpdateData.Division = {
              set: updateCourseDto.divisionIds.map((id) => ({ id })),
            };
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
      whereConditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM "_CourseToDivision" cd 
          WHERE cd."A" = c.id AND cd."B" = ${divisionId}
        )`,
      );
    if (teacherId !== undefined)
      whereConditions.push(Prisma.sql`c."teacherId" = ${teacherId}`);
    if (subjectId !== undefined)
      whereConditions.push(Prisma.sql`c."subjectId" = ${subjectId}`);
    if (q?.trim())
      whereConditions.push(
        Prisma.sql`c."courseName" ILIKE ${'%' + q.trim() + '%'}`,
      );
    if (courseType !== undefined)
      whereConditions.push(
        Prisma.sql`c."courseType"::"text" = ${courseType}::"text"`,
      );

    if (minPrice !== undefined)
      whereConditions.push(Prisma.sql`c.price >= ${minPrice}`);
    if (maxPrice !== undefined)
      whereConditions.push(Prisma.sql`c.price <= ${maxPrice}`);

    const finalWhereClause = Prisma.sql`WHERE ${Prisma.join(
      whereConditions,
      ' AND ',
    )}`;

    let orderByClause: Prisma.Sql;
    switch (sortBy) {
      case CourseSortBy.RATING:
        orderByClause = Prisma.sql`COALESCE(review_stats.avg_rating, 0) ${Prisma.raw(
          sortOrder,
        )}`;
        break;
      case CourseSortBy.PRICE:
        orderByClause = Prisma.sql`c.price ${Prisma.raw(sortOrder)}`;
        break;
      case CourseSortBy.STUDENTS_COUNT:
        orderByClause = Prisma.sql`COALESCE(student_count.student_count, 0) ${Prisma.raw(
          sortOrder,
        )}`;
        break;
      default:
        orderByClause = Prisma.sql`COALESCE(review_stats.avg_rating, 0) ${Prisma.raw(
          sortOrder,
        )}`;
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
  async getCourse(id: number) {
    const course = await this.prisma.$queryRaw<CourseRow[]>`
WITH course_base AS (
  SELECT 
    c.id as course_id,
    c.thumbnail,
    c."courseName", 
    c.description, 
    c.price,
    c."courseFeatures",
    t.id as teacher_id,
    u."displayName" as "teacherName",
    u."profilePicture" as "teacherProfilePicture",
    t.bio as "teacherBio",
    s.name as "teacherSubject"
  FROM "Course" c
    INNER JOIN "Teacher" t ON c."teacherId" = t.id
    INNER JOIN "User" u ON t.id = u.id
    LEFT JOIN "Subject" s ON t."subjectId" = s.id
  WHERE c.id = ${id}
),

course_stats AS (
  SELECT 
    ${id} as course_id,
    COALESCE(AVG(r.rating::decimal), 0)::float as course_rating,
    COUNT(DISTINCT sc."studentId")::integer as students_count,
    COUNT(DISTINCT cl."lectureId")::integer as lectures_count,
    COUNT(DISTINCT q.id)::integer as quizzes_count
  FROM "Course" c
    LEFT JOIN "StudentCourse" sc ON c.id = sc."courseId"
    LEFT JOIN "CourseLecture" cl ON c.id = cl."courseId"
    LEFT JOIN "Review" r ON c.id = r."courseId"
    LEFT JOIN "Quiz" q ON cl."lectureId" = q."lectureId" AND q."isActive" = true
  WHERE c.id = ${id}
),

teacher_stats AS (
  SELECT 
    c."teacherId" as teacher_id,
    COALESCE(AVG(r2.rating::decimal), 0)::float as teacher_rating,
    COUNT(DISTINCT sc2."studentId")::integer as teacher_total_students,
    COUNT(DISTINCT c2.id)::integer as teacher_total_courses
  FROM "Course" c
    LEFT JOIN "Course" c2 ON c."teacherId" = c2."teacherId"
    LEFT JOIN "Review" r2 ON c2.id = r2."courseId"
    LEFT JOIN "StudentCourse" sc2 ON c2.id = sc2."courseId"
  WHERE c.id = ${id}
  GROUP BY c."teacherId"
)

SELECT 
  cb.course_id as "id",
  cb.thumbnail,
  cb."courseName",
  cb.description,
  cb.price,
  cb."courseFeatures",
  jsonb_build_object(
    'id', cb.teacher_id,
    'teacherName', cb."teacherName",
    'teacherProfilePicture', cb."teacherProfilePicture",
    'teacherBio', cb."teacherBio",
    'teacherSubject', cb."teacherSubject",
    'teacherRating', ts.teacher_rating,
    'teacherTotalStudents', ts.teacher_total_students,
    'teacherTotalCourses', ts.teacher_total_courses
  ) as teacher,
  cs.course_rating as "courseRating",
  cs.students_count as "studentsCount",
  cs.lectures_count as "lecturesCount",
  cs.quizzes_count as "quizzesCount"
FROM course_base cb
  CROSS JOIN course_stats cs
  LEFT JOIN teacher_stats ts ON cb.course_id = cs.course_id;
`;
    if (course.length === 0) {
      throw new NotFoundException('الدورة غير موجودة');
    }
    return course[0];
  }
  async getcourseLectures(courseId: number, userId?: number) {
    let isOwner = false;
    if (userId) {
      isOwner = await this.checkOwnership(courseId, userId);
    }

    if (!isOwner) {
      const lectures = await this.prisma.$queryRaw`
WITH lecture_content_agg AS (
  SELECT 
    lc."lectureId",
    JSON_AGG(
      jsonb_build_object(
        'id', lc.id,
        'duration', lc.duration,
        'contentType', lc."contentType",
        'orderIndex', lc."orderIndex",
        'contentName', lc."contentName"
      ) ORDER BY lc."orderIndex"
    ) as content_json,
    COUNT(*) as content_count,
    COALESCE(SUM(CASE WHEN lc.duration IS NOT NULL THEN lc.duration ELSE 0 END), 0) as total_duration,
    COUNT(CASE WHEN lc."contentType" = 'VIDEO' THEN 1 END) as video_count,
    COUNT(CASE WHEN lc."contentType" = 'FILE' THEN 1 END) as file_count
  FROM "LectureContent" lc
    INNER JOIN "CourseLecture" cl ON lc."lectureId" = cl."lectureId"
  WHERE cl."courseId" = ${courseId}
  GROUP BY lc."lectureId"
),

quiz_agg AS (
  SELECT 
    q."lectureId",
    JSON_AGG(
      jsonb_build_object(
        'id', q.id,
        'title', q.title,
        'description', q.description,
        'maxAttempts', q."maxAttempts",
        'orderIndex', q."orderIndex",
        'isActive', q."isActive"
      ) ORDER BY q."orderIndex"
    ) as quiz_json,
    COUNT(*) as quiz_count
  FROM "Quiz" q
    INNER JOIN "CourseLecture" cl ON q."lectureId" = cl."lectureId"
  WHERE cl."courseId" = ${courseId} AND q."isActive" = true
  GROUP BY q."lectureId"
)

SELECT 
  l.id,
  l."lectureName",
  cl."orderIndex",
  COALESCE(lca.content_json, '[]'::json) as "lectureContent",
  COALESCE(qa.quiz_json, '[]'::json) as quizzes,
  COALESCE(lca.content_count, 0)::integer + COALESCE(qa.quiz_count, 0)::integer as "totalItems",
  COALESCE(lca.video_count, 0)::integer as "videoCount",
  COALESCE(lca.file_count, 0)::integer as "fileCount",
  COALESCE(qa.quiz_count, 0)::integer as "quizCount",
  CASE 
    WHEN COALESCE(lca.total_duration, 0) >= 3600 THEN 
      CONCAT(
        FLOOR(COALESCE(lca.total_duration, 0) / 3600), 'س ',
        FLOOR((COALESCE(lca.total_duration, 0) % 3600) / 60), 'د '
      )
    WHEN COALESCE(lca.total_duration, 0) >= 60 THEN 
      CONCAT(FLOOR(COALESCE(lca.total_duration, 0) / 60), 'د ')
    WHEN COALESCE(lca.total_duration, 0) > 0 THEN
      CONCAT(COALESCE(lca.total_duration, 0), 'ث ')
    ELSE ''
  END as "formattedDuration"
FROM "CourseLecture" cl
  INNER JOIN "Lecture" l ON cl."lectureId" = l.id
  LEFT JOIN lecture_content_agg lca ON l.id = lca."lectureId"
  LEFT JOIN quiz_agg qa ON l.id = qa."lectureId"
WHERE cl."courseId" = ${courseId}
ORDER BY cl."orderIndex";
`;
      return { lectures };
    }

    const lectures = await this.prisma.$queryRaw`
WITH lecture_content_agg AS (
  SELECT 
    lc."lectureId",
    JSON_AGG(
      jsonb_build_object(
        'id', lc.id,
        'duration', lc.duration,
        'contentType', lc."contentType",
        'orderIndex', lc."orderIndex",
        'contentName', lc."contentName",
        'isCompleted', COALESCE(slp."isCompleted", false)
      ) ORDER BY lc."orderIndex"
    ) as content_json,
    COUNT(*) as content_count,
    COALESCE(SUM(CASE WHEN lc.duration IS NOT NULL THEN lc.duration ELSE 0 END), 0) as total_duration,
    COUNT(CASE WHEN lc."contentType" = 'VIDEO' THEN 1 END) as video_count,
    COUNT(CASE WHEN lc."contentType" = 'FILE' THEN 1 END) as file_count,
    COUNT(CASE WHEN slp."isCompleted" = true THEN 1 END) as completed_count
  FROM "LectureContent" lc
    INNER JOIN "CourseLecture" cl ON lc."lectureId" = cl."lectureId"
    LEFT JOIN "StudentLectureProgress" slp ON lc.id = slp."lectureContentId" AND slp."studentId" = ${userId}
  WHERE cl."courseId" = ${courseId}
  GROUP BY lc."lectureId"
),

quiz_attempts_count AS (
  SELECT 
    qa."quizId",
    COUNT(*)::integer as attempt_count
  FROM "QuizAttempt" qa
  WHERE qa."studentId" = ${userId} AND qa."isCompleted" = true
  GROUP BY qa."quizId"
),

quiz_agg AS (
  SELECT 
    q."lectureId",
    JSON_AGG(
      jsonb_build_object(
        'id', q.id,
        'title', q.title,
        'description', q.description,
        'maxAttempts', q."maxAttempts",
        'orderIndex', q."orderIndex",
        'isActive', q."isActive",
        'remainingAttempts', CASE 
          WHEN q."maxAttempts" IS NULL THEN NULL
          ELSE GREATEST(0, q."maxAttempts" - COALESCE(qac.attempt_count, 0))
        END
      ) ORDER BY q."orderIndex"
    ) as quiz_json,
    COUNT(*) as quiz_count,
    COUNT(CASE WHEN qac.attempt_count >= 1 THEN 1 END) as completed_quiz_count
  FROM "Quiz" q
    INNER JOIN "CourseLecture" cl ON q."lectureId" = cl."lectureId"
    LEFT JOIN quiz_attempts_count qac ON q.id = qac."quizId"
  WHERE cl."courseId" = ${courseId} AND q."isActive" = true
  GROUP BY q."lectureId"
)

SELECT 
  l.id,
  l."lectureName",
  cl."orderIndex",
  COALESCE(lca.content_json, '[]'::json) as "lectureContent",
  COALESCE(qa.quiz_json, '[]'::json) as quizzes,
  COALESCE(lca.content_count, 0)::integer + COALESCE(qa.quiz_count, 0)::integer as "totalItems",
  COALESCE(lca.video_count, 0)::integer as "videoCount",
  COALESCE(lca.file_count, 0)::integer as "fileCount",
  COALESCE(qa.quiz_count, 0)::integer as "quizCount",
  COALESCE(lca.completed_count, 0)::integer + COALESCE(qa.completed_quiz_count, 0)::integer as "totalCompletedContent",
  CASE 
    WHEN COALESCE(lca.total_duration, 0) >= 3600 THEN 
      CONCAT(
        FLOOR(COALESCE(lca.total_duration, 0) / 3600), 'س ',
        FLOOR((COALESCE(lca.total_duration, 0) % 3600) / 60), 'د '
      )
    WHEN COALESCE(lca.total_duration, 0) >= 60 THEN 
      CONCAT(FLOOR(COALESCE(lca.total_duration, 0) / 60), 'د ')
    WHEN COALESCE(lca.total_duration, 0) > 0 THEN
      CONCAT(COALESCE(lca.total_duration, 0), 'ث ')
    ELSE ''
  END as "formattedDuration"
FROM "CourseLecture" cl
  INNER JOIN "Lecture" l ON cl."lectureId" = l.id
  LEFT JOIN lecture_content_agg lca ON l.id = lca."lectureId"
  LEFT JOIN quiz_agg qa ON l.id = qa."lectureId"
WHERE cl."courseId" = ${courseId}
ORDER BY cl."orderIndex";
`;
    return { lectures };
  }
  async getOwnershipStatus(courseId: number, userId: number) {
    const isOwned = await this.checkOwnership(courseId, userId);
    return { isOwned };
  }

  private async checkOwnership(
    courseId: number,
    userId: number,
  ): Promise<boolean> {
    const ownership = await this.prisma.studentCourse.findFirst({
      where: {
        courseId,
        studentId: userId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (ownership) {
      return true;
    }

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { teacherId: true },
    });

    return !!(course && course.teacherId === userId);
  }
  async getRelatedCourses(id: number) {
    try {
      const currentCourse = await this.prisma.course.findUnique({
        where: { id },
        select: { teacherId: true, subjectId: true },
      });

      if (!currentCourse) {
        throw new NotFoundException('الدورة غير موجودة');
      }

      const { teacherId, subjectId } = currentCourse;

      const relatedCourses = await this.prisma.$queryRaw<CourseQueryResult[]>`
    WITH same_teacher_courses AS (
      SELECT 
        c.id,
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
      WHERE c."teacherId" = ${teacherId} AND c.id != ${id}
    ),
    
    same_subject_courses AS (
      SELECT 
        c.id,
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
      WHERE c."subjectId" = ${subjectId} AND c."teacherId" != ${teacherId} AND c.id != ${id}
    ),
    
    combined_courses AS (
      SELECT * FROM same_teacher_courses
      UNION ALL
      SELECT * FROM same_subject_courses
    )
    
    SELECT 
      id,
      thumbnail,
      "courseName",
      "coursePrice",
      "courseType",
      "teacherName",
      "teacherProfilePicture",
      "teacherId",
      "gradeName",
      "subjectName",
      "numberOfReviews",
      "avgRating",
      "numberOfLectures",
      "numberOfStudents"
    FROM combined_courses
    ORDER BY RANDOM()
    LIMIT 4
  `;
      return relatedCourses;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async getCoursesForTeacher(teacherId: number, query: GetTeacherCoursesDto) {
    const {
      sortBy = TeacherCourseSortBy.CREATED_AT,
      sortOrder = TeacherSortOrder.DESC,
      pageNumber = 1,
      pageSize = 20,
      q,
      minStudents,
      maxStudents,
      minPrice,
      maxPrice,
      minRating,
      maxRating,
      courseType,
    } = query;

    const offset = (pageNumber - 1) * pageSize;

    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`c."teacherId" = ${teacherId}`,
    ];

    if (q?.trim()) {
      whereConditions.push(
        Prisma.sql`c."courseName" ILIKE ${'%' + q.trim() + '%'}`,
      );
    }

    if (courseType !== undefined) {
      whereConditions.push(
        Prisma.sql`c."courseType"::"text" = ${courseType}::"text"`,
      );
    }

    if (minPrice !== undefined) {
      whereConditions.push(Prisma.sql`c.price >= ${minPrice}`);
    }

    if (maxPrice !== undefined) {
      whereConditions.push(Prisma.sql`c.price <= ${maxPrice}`);
    }

    const finalWhereClause = Prisma.sql`WHERE ${Prisma.join(
      whereConditions,
      ' AND ',
    )}`;

    const havingConditions: Prisma.Sql[] = [];

    if (minStudents !== undefined) {
      havingConditions.push(Prisma.sql`student_count >= ${minStudents}`);
    }

    if (maxStudents !== undefined) {
      havingConditions.push(Prisma.sql`student_count <= ${maxStudents}`);
    }

    if (minRating !== undefined) {
      havingConditions.push(Prisma.sql`avg_rating >= ${minRating}`);
    }

    if (maxRating !== undefined) {
      havingConditions.push(Prisma.sql`avg_rating <= ${maxRating}`);
    }

    const finalHavingClause =
      havingConditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(havingConditions, ' AND ')}`
        : Prisma.sql``;

    let orderByClause: Prisma.Sql;
    const order =
      sortOrder === TeacherSortOrder.ASC ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    switch (sortBy) {
      case TeacherCourseSortBy.COURSE_NAME:
        orderByClause = Prisma.sql`fc."courseName" ${order}`;
        break;
      case TeacherCourseSortBy.PRICE:
        orderByClause = Prisma.sql`fc.price ${order}`;
        break;
      case TeacherCourseSortBy.NUMBER_OF_STUDENTS:
        orderByClause = Prisma.sql`fc.student_count ${order}`;
        break;
      case TeacherCourseSortBy.NUMBER_OF_LECTURES:
        orderByClause = Prisma.sql`fc.lecture_count ${order}`;
        break;
      case TeacherCourseSortBy.AVG_RATING:
        orderByClause = Prisma.sql`fc.avg_rating ${order}`;
        break;
      case TeacherCourseSortBy.TOTAL_REVENUE:
        orderByClause = Prisma.sql`fc.total_revenue ${order}`;
        break;
      case TeacherCourseSortBy.CREATED_AT:
      default:
        orderByClause = Prisma.sql`fc."createdAt" ${order}`;
        break;
    }

    const finalOrderByClause = Prisma.sql`ORDER BY ${orderByClause}, fc.id`;

    const [countResult, result] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: bigint }[]>`
        WITH filtered_courses AS (
          SELECT c.id
          FROM "Course" c
          INNER JOIN "Grade" g ON c."gradeId" = g.id
          LEFT JOIN (
            SELECT 
              sc."courseId",
              COUNT(*)::int as student_count
            FROM "StudentCourse" sc
            WHERE sc."isActive" = true
            GROUP BY sc."courseId"
          ) student_count ON c.id = student_count."courseId"
          LEFT JOIN (
            SELECT 
              r."courseId",
              ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
            FROM "Review" r
            GROUP BY r."courseId"
          ) review_stats ON c.id = review_stats."courseId"
          ${finalWhereClause}
        ),
        filtered_with_conditions AS (
          SELECT * FROM filtered_courses
          ${finalHavingClause}
        )
        SELECT COUNT(*)::bigint as count FROM filtered_with_conditions
      `,
      this.prisma.$queryRaw<TeacherCourseQueryResult[]>`
        WITH filtered_courses AS (
          SELECT 
            c.id,
            c."courseName",
            c."courseType",
            c.price,
            c."createdAt",
            g.id as grade_id,
            g.name as grade_name,
            COALESCE(student_count.student_count, 0) as student_count,
            COALESCE(lecture_count.lecture_count, 0) as lecture_count,
            COALESCE(review_stats.avg_rating, 0) as avg_rating,
            COALESCE(revenue_stats.total_revenue, 0) as total_revenue
          FROM "Course" c
          INNER JOIN "Grade" g ON c."gradeId" = g.id
          LEFT JOIN (
            SELECT 
              sc."courseId",
              COUNT(*)::int as student_count
            FROM "StudentCourse" sc
            WHERE sc."isActive" = true
            GROUP BY sc."courseId"
          ) student_count ON c.id = student_count."courseId"
          LEFT JOIN (
            SELECT 
              cl."courseId",
              COUNT(*)::int as lecture_count
            FROM "CourseLecture" cl
            GROUP BY cl."courseId"
          ) lecture_count ON c.id = lecture_count."courseId"
          LEFT JOIN (
            SELECT 
              r."courseId",
              ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
            FROM "Review" r
            GROUP BY r."courseId"
          ) review_stats ON c.id = review_stats."courseId"
          LEFT JOIN (
            SELECT 
              oi."productId" as course_id,
              ROUND(COALESCE(SUM(t."teacherShare"), 0)::numeric, 2)::float as total_revenue
            FROM "OrderItem" oi
            INNER JOIN "Transaction" t ON t."orderItemId" = oi.id
            WHERE oi."productType" = 'COURSE'
            GROUP BY oi."productId"
          ) revenue_stats ON c.id = revenue_stats.course_id
          ${finalWhereClause}
        ),
        filtered_with_conditions AS (
          SELECT * FROM filtered_courses
          ${finalHavingClause}
        )
        SELECT 
          fc.id,
          fc."courseName",
          fc."courseType",
          fc.price::float as price,
          fc."createdAt",
          jsonb_build_object(
            'id', fc.grade_id,
            'name', fc.grade_name
          ) as "Grade",
          COALESCE(
            jsonb_agg(
              DISTINCT jsonb_build_object('id', d.id, 'name', d.name)
            ) FILTER (WHERE d.id IS NOT NULL),
            '[]'::jsonb
          ) as "Division",
          jsonb_build_object(
            'Students', fc.student_count,
            'Lectures', fc.lecture_count
          ) as "_count",
          fc.avg_rating::float as "avgRating",
          fc.total_revenue::float as "totalRevenue"
        FROM filtered_with_conditions fc
        LEFT JOIN "_CourseToDivision" cd ON fc.id = cd."A"
        LEFT JOIN "Division" d ON cd."B" = d.id
        GROUP BY 
          fc.id, 
          fc."courseName", 
          fc."courseType", 
          fc.price, 
          fc."createdAt",
          fc.grade_id,
          fc.grade_name,
          fc.student_count,
          fc.lecture_count,
          fc.avg_rating,
          fc.total_revenue
        ${finalOrderByClause}
        LIMIT ${pageSize} OFFSET ${offset}
      `,
    ]);

    const courses = result;
    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      courses,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }
  async getCourseDataForUpdate(teacherId: number, courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: {
        id: courseId,
        teacherId,
      },
      select: {
        courseName: true,
        price: true,
        CourseLecture: {
          select: {
            lectureId: true,
            lecture: {
              select: {
                lectureName: true,
              },
            },
          },
        },
        expiresAt: true,
        description: true,
        courseType: true,
        gradeId: true,
        Division: true,
        courseFeatures: true,
        thumbnail: true,
      },
    });
    if (!course) {
      throw new NotFoundException(
        'الدورة غير موجودة أو ليس لديك صلاحية للوصول إليها',
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { Division, ...restCourse } = course;
    return {
      ...restCourse,
      lectures: course.CourseLecture.map((cl) => ({
        id: cl.lectureId,
        lectureName: cl.lecture.lectureName,
      })),
      divisionIds: course.Division.map((d) => d.id),
    };
  }
  async getAllCoursesIds() {
    const courses = await this.prisma.course.findMany({
      select: {
        id: true,
      },
    });
    return courses.map((course) => ({
      id: course.id.toString(),
    }));
  }
  async generateLectureContentUrl(
    id: number,
    courseId: number,
    studentId: number,
  ) {
    const isOwned = await this.getOwnershipStatus(courseId, studentId);
    if (!isOwned) {
      throw new ForbiddenException('برجاء شراء الكورس اولا');
    }
    const lectureContent = await this.prisma.lectureContent.findFirst({
      where: {
        id,
        lecture: {
          CourseLecture: {
            some: {
              courseId: courseId,
            },
          },
        },
      },
      select: {
        contentKey: true,
        contentType: true,
      },
    });
    if (!lectureContent) {
      throw new NotFoundException('الدرس غير موجود');
    }

    if (lectureContent.contentType === ContentType.FILE) {
      await this.markLectureContentAsCompletedInternal(studentId, id);
    }

    const { url } = await this.s3Service.getPresignedSignedUrl(
      lectureContent.contentKey,
    );
    return { url };
  }

  async markLectureContentAsCompleted(
    lectureContentId: number,
    courseId: number,
    studentId: number,
  ) {
    const { isOwned } = await this.getOwnershipStatus(courseId, studentId);
    if (!isOwned) {
      throw new ForbiddenException('برجاء شراء الكورس اولا');
    }

    const lectureContent = await this.prisma.lectureContent.findFirst({
      where: {
        id: lectureContentId,
        lecture: {
          CourseLecture: {
            some: {
              courseId: courseId,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!lectureContent) {
      throw new NotFoundException('المحتوى غير موجود');
    }

    await this.markLectureContentAsCompletedInternal(
      studentId,
      lectureContentId,
    );

    return { success: true };
  }

  private async markLectureContentAsCompletedInternal(
    studentId: number,
    lectureContentId: number,
  ) {
    await this.prisma.studentLectureProgress.upsert({
      where: {
        studentId_lectureContentId: {
          studentId,
          lectureContentId,
        },
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
      },
      create: {
        studentId,
        lectureContentId,
        isCompleted: true,
        completedAt: new Date(),
      },
    });
  }
}
