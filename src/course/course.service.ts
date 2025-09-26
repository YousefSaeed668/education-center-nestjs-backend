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
  courseRow,
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
  async getCourse(id: number, userId?: number) {
    const course = await this.prisma.$queryRaw<courseRow[]>`
  WITH course_base AS (
    -- Get basic course and teacher info first
    SELECT 
      c.id as course_id,
      c."courseName", 
      c.description, 
      c.price,
      c."courseFeatures",
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
    -- Separate stats calculation for better performance
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
  
  course_ownership AS (
    -- Check if the current user owns this course
    SELECT 
      ${id} as course_id,
      CASE 
        WHEN ${userId}::integer IS NULL THEN false
        WHEN sc."studentId" IS NOT NULL AND sc."isActive" = true THEN true
        ELSE false
      END as owned
    FROM "Course" c
      LEFT JOIN "StudentCourse" sc ON c.id = sc."courseId" 
        AND sc."studentId" = ${userId}::integer
        AND sc."isActive" = true
    WHERE c.id = ${id}
  ),
  
  teacher_stats AS (
    -- Separate teacher stats for reusability
    SELECT 
      c."teacherId" as teacher_id,
      COALESCE(AVG(r2.rating::decimal), 0)::float as teacher_rating,
      COUNT(DISTINCT sc2."studentId")::integer as teacher_total_students
    FROM "Course" c
      LEFT JOIN "Course" c2 ON c."teacherId" = c2."teacherId"
      LEFT JOIN "Review" r2 ON c2.id = r2."courseId"
      LEFT JOIN "StudentCourse" sc2 ON c2.id = sc2."courseId"
    WHERE c.id = ${id}
    GROUP BY c."teacherId"
  ),
  
  lecture_content_agg AS (
    -- Pre-aggregate lecture content
    SELECT 
      lc."lectureId",
      JSON_AGG(
        jsonb_build_object(
          'duration', lc.duration,
          'contentType', lc."contentType",
          'orderIndex', lc."orderIndex",
          'contentName', lc."contentName"
        ) ORDER BY lc."orderIndex"
      ) as content_json,
      COUNT(*) as content_count
    FROM "LectureContent" lc
      INNER JOIN "CourseLecture" cl ON lc."lectureId" = cl."lectureId"
    WHERE cl."courseId" = ${id}
    GROUP BY lc."lectureId"
  ),
  
  quiz_agg AS (
    -- Pre-aggregate quizzes
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
    WHERE cl."courseId" = ${id} AND q."isActive" = true
    GROUP BY q."lectureId"
  ),
  
  lectures_complete AS (
    -- Combine all lecture data
    SELECT 
      cl."courseId",
      JSON_AGG(
        jsonb_build_object(
          'id', l.id,
          'lectureName', l."lectureName",
          'orderIndex', cl."orderIndex",
          'lectureContent', COALESCE(lca.content_json, '[]'::json),
          'quizzes', COALESCE(qa.quiz_json, '[]'::json),
          'totalItems', COALESCE(lca.content_count, 0) + COALESCE(qa.quiz_count, 0)
        ) ORDER BY cl."orderIndex"
      ) as lectures_json
    FROM "CourseLecture" cl
      INNER JOIN "Lecture" l ON cl."lectureId" = l.id
      LEFT JOIN lecture_content_agg lca ON l.id = lca."lectureId"
      LEFT JOIN quiz_agg qa ON l.id = qa."lectureId"
    WHERE cl."courseId" = ${id}
    GROUP BY cl."courseId"
  )
  
  -- Final result assembly
  SELECT 
    cb."courseName",
    cb.description,
    cb.price,
    cb."courseFeatures",
    cb."teacherName",
    cb."teacherProfilePicture",
    cb."teacherBio",
    cb."teacherSubject",
    cs.course_rating as "courseRating",
    cs.students_count as "studentsCount",
    cs.lectures_count as "lecturesCount",
    cs.quizzes_count as "quizzesCount",
    co.owned,
    ts.teacher_rating as "teacherRating",
    ts.teacher_total_students as "teacherTotalStudents",
    COALESCE(lc.lectures_json, '[]'::json) as lectures
  FROM course_base cb
    CROSS JOIN course_stats cs
    CROSS JOIN course_ownership co
    LEFT JOIN teacher_stats ts ON cb.course_id = cs.course_id
    LEFT JOIN lectures_complete lc ON cb.course_id = lc."courseId";
`;

    return course[0];
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
      throw error; // Re-throw the error so it can be handled by the calling code
    }
  }
}
