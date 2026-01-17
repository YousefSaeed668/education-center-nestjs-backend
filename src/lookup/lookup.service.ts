import { Injectable } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { UserType } from './dto/get-signup-data.dto';

@Injectable()
export class LookupService {
  constructor(private readonly prisma: PrismaService) {}
  async getSignUpData(userType: UserType) {
    if (userType === UserType.STUDENT) {
      const [
        cities,
        governments,
        grades,
        divisions,
        educationTypes,
        schoolTypes,
        secondLanguages,
      ] = await Promise.all([
        this.prisma.city.findMany(),
        this.prisma.government.findMany(),
        this.prisma.grade.findMany(),
        this.prisma.division.findMany(),
        this.prisma.educationType.findMany(),
        this.prisma.schoolType.findMany(),
        this.prisma.secondLanguage.findMany(),
      ]);
      return {
        cities,
        governments,
        grades,
        divisions,
        educationTypes,
        schoolTypes,
        secondLanguages,
      };
    } else if (userType === UserType.TEACHER) {
      const [divisions, grades, educationTypes, subjects] = await Promise.all([
        this.prisma.division.findMany(),
        this.prisma.grade.findMany(),
        this.prisma.educationType.findMany(),
        this.prisma.subject.findMany(),
      ]);
      return {
        divisions,
        grades,
        educationTypes,
        subjects,
      };
    }
  }

  async getProductsData(productType: ProductType) {
    const productCountPromise =
      productType === ProductType.COURSE
        ? this.prisma.course.count()
        : this.prisma.book.count();

    const [
      subjects,
      grades,
      divisions,
      productCount,
      teacherCount,
      studentCount,
    ] = await Promise.all([
      this.prisma.subject.findMany(),
      this.prisma.grade.findMany(),
      this.prisma.division.findMany(),
      productCountPromise,
      this.prisma.teacher.count(),
      this.prisma.student.count(),
    ]);

    return {
      filters: {
        subjects,
        grades,
        divisions,
      },
      productPageStats: {
        productCount,
        teacherCount,
        studentCount,
      },
    };
  }
  async getTeacherData() {
    const [
      subjects,
      grades,
      numberOfTeachers,
      numberOfStudents,
      numberOfCourses,
      avgRating,
    ] = await Promise.all([
      this.prisma.subject.findMany(),
      this.prisma.grade.findMany(),
      this.prisma.teacher.count(),
      this.prisma.student.count(),
      this.prisma.course.count(),
      this.prisma.review.aggregate({
        _avg: {
          rating: true,
        },
      }),
    ]);

    return {
      filters: { subjects, grades },
      teacherPageStats: {
        numberOfTeachers,
        numberOfStudents,
        numberOfCourses,
        avgRating: avgRating._avg.rating,
      },
    };
  }
  async getLocationData() {
    const cities = await this.prisma.city.findMany();
    const governments = await this.prisma.government.findMany();
    return { cities, governments };
  }

  async getHomePageData() {
    const result = await this.prisma.$queryRaw<
      {
        heroSection: {
          numberOfStudents: number;
          avgQuizSuccessRate: number;
          numberOfTeachers: number;
          avgRating: number;
          randomSubjects: { id: number; name: string }[];
        };
        subjectsSection: {
          id: number;
          name: string;
          numberOfLectures: number;
          numberOfHours: number;
          avgRating: number;
        }[];
        teachersSection: {
          subjectId: number;
          subjectName: string;
          teachers: {
            id: number;
            profilePicture: string | null;
            displayName: string;
            subjectName: string;
            bio: string | null;
            gender: 'MALE' | 'FEMALE';
            avgRating: number;
            numberOfCourses: number;
            numberOfBooks: number;
            numberOfStudents: number;
          }[];
        }[];
        coursesSection: {
          mostPopular: {
            id: number;
            thumbnail: string;
            courseName: string;
            coursePrice: number;
            courseType: string;
            teacherId: number;
            teacherName: string;
            teacherProfilePicture: string | null;
            gradeName: string;
            subjectName: string;
            numberOfReviews: number;
            avgRating: number;
            numberOfLectures: number;
            numberOfStudents: number;
          }[];
          latest: {
            id: number;
            thumbnail: string;
            courseName: string;
            coursePrice: number;
            courseType: string;
            teacherId: number;
            teacherName: string;
            teacherProfilePicture: string | null;
            gradeName: string;
            subjectName: string;
            numberOfReviews: number;
            avgRating: number;
            numberOfLectures: number;
            numberOfStudents: number;
          }[];
          numberOfCourses: number;
        };
        booksSection: {
          id: number;
          thumbnail: string;
          bookName: string;
          description: string;
          bookFeatures: string[];
          bookPrice: number;
          teacherName: string;
          teacherProfilePicture: string | null;
          teacherId: number;
          gradeName: string;
          subjectName: string | null;
          numberOfReviews: number;
          avgRating: number;
          numberOfOrders: number;
          grade: { id: number; name: string };
          divisions: { id: number; name: string }[];
        }[];
      }[]
    >`
      WITH 
      hero_stats AS (
        SELECT 
          (SELECT COUNT(*)::int FROM "Student") as "numberOfStudents",
          (SELECT COUNT(*)::int FROM "Teacher" WHERE "isActive" = true) as "numberOfTeachers",
          COALESCE(
            (SELECT 
              ROUND(AVG(CASE WHEN qa."totalScore" > 0 THEN (qa."score"::float / qa."totalScore"::float) * 100 ELSE 0 END)::numeric, 2)::float
            FROM "QuizAttempt" qa 
            WHERE qa."isCompleted" = true), 
          0) as "avgQuizSuccessRate",
          COALESCE(
            (SELECT 
              ROUND(AVG(rating)::numeric, 2)::float
            FROM "Review"), 
          0) as "avgRating"
      ),
      
      hero_random_subjects AS (
        SELECT id, name 
        FROM "Subject" 
        WHERE random() < 0.5
        ORDER BY random()
        LIMIT 4
      ),
      
      subjects_section AS (
        SELECT 
          s.id,
          s.name,
          COALESCE(COUNT(DISTINCT cl."lectureId"), 0)::int as "numberOfLectures",
          ROUND(COALESCE(SUM(lc.duration), 0)::numeric / 3600, 2)::float as "numberOfHours",
          ROUND(COALESCE(AVG(r.rating), 0)::numeric, 2)::float as "avgRating"
        FROM (
          SELECT id, name 
          FROM "Subject"
          WHERE random() < 0.5
          ORDER BY random()
          LIMIT 4
        ) s
        LEFT JOIN "Course" c ON c."subjectId" = s.id
        LEFT JOIN "CourseLecture" cl ON cl."courseId" = c.id
        LEFT JOIN "Lecture" l ON l.id = cl."lectureId"
        LEFT JOIN "LectureContent" lc ON lc."lectureId" = l.id
        LEFT JOIN "Review" r ON r."courseId" = c.id
        GROUP BY s.id, s.name
      ),
      
      teacher_random_subjects AS (
        SELECT id, name 
        FROM "Subject"
        WHERE random() < 0.5
        ORDER BY random()
        LIMIT 4
      ),
      
      teacher_stats AS (
        SELECT 
          t.id,
          t."subjectId",
          rs.name as "subjectName",
          u."profilePicture",
          u."displayName",
          t.bio,
          u.gender,
          ROUND(COALESCE(AVG(r.rating), 0)::numeric, 2)::float as "avgRating",
          COUNT(DISTINCT c.id)::int as "numberOfCourses",
          COUNT(DISTINCT b.id)::int as "numberOfBooks",
          COUNT(DISTINCT sc."studentId")::int as "numberOfStudents",
          ROW_NUMBER() OVER (PARTITION BY t."subjectId" ORDER BY random()) as rn
        FROM "Teacher" t
        INNER JOIN "User" u ON t.id = u.id
        INNER JOIN teacher_random_subjects rs ON t."subjectId" = rs.id
        LEFT JOIN "Course" c ON c."teacherId" = t.id
        LEFT JOIN "Review" r ON r."courseId" = c.id
        LEFT JOIN "Book" b ON b."teacherId" = t.id
        LEFT JOIN "StudentCourse" sc ON sc."courseId" = c.id AND sc."isActive" = true
        WHERE t."isActive" = true AND random() < 0.5
        GROUP BY t.id, t."subjectId", rs.name, u."profilePicture", u."displayName", t.bio, u.gender
      ),
      
      teachers_grouped AS (
        SELECT 
          "subjectId",
          "subjectName",
          jsonb_agg(
            jsonb_build_object(
              'id', id,
              'profilePicture', "profilePicture",
              'displayName', "displayName",
              'subjectName', "subjectName",
              'bio', bio,
              'gender', gender,
              'avgRating', "avgRating",
              'numberOfCourses', "numberOfCourses",
              'numberOfBooks', "numberOfBooks",
              'numberOfStudents', "numberOfStudents"
            )
          ) as teachers
        FROM teacher_stats
        WHERE rn <= 4
        GROUP BY "subjectId", "subjectName"
      ),
      
      course_review_stats AS (
        SELECT 
          r."courseId",
          COUNT(*)::int as review_count,
          ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
        FROM "Review" r
        WHERE r."productType" = 'COURSE'
        GROUP BY r."courseId"
      ),
      
      course_lecture_count AS (
        SELECT 
          cl."courseId",
          COUNT(*)::int as lecture_count
        FROM "CourseLecture" cl
        GROUP BY cl."courseId"
      ),
      
      course_student_count AS (
        SELECT 
          sc."courseId",
          COUNT(*)::int as student_count
        FROM "StudentCourse" sc
        WHERE sc."isActive" = true
        GROUP BY sc."courseId"
      ),
      
      course_sales AS (
        SELECT 
          oi."productId",
          COUNT(*)::int as sales_count
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON oi."orderId" = o.id
        WHERE oi."productType" = 'COURSE' AND o.status = 'COMPLETED'
        GROUP BY oi."productId"
      ),
      
      courses_base AS (
        SELECT 
          c.id,
          c.thumbnail,
          c."courseName",
          c.price::float as "coursePrice",
          c."courseType",
          u.id as "teacherId",
          u."displayName" as "teacherName",
          u."profilePicture" as "teacherProfilePicture",
          g.name as "gradeName",
          s.name as "subjectName",
          COALESCE(crs.review_count, 0)::int as "numberOfReviews",
          COALESCE(crs.avg_rating, 0)::float as "avgRating",
          COALESCE(clc.lecture_count, 0)::int as "numberOfLectures",
          COALESCE(csc.student_count, 0)::int as "numberOfStudents",
          COALESCE(cs.sales_count, 0) as sales_count,
          c."createdAt"
        FROM "Course" c
        INNER JOIN "Teacher" t ON c."teacherId" = t.id
        INNER JOIN "User" u ON t.id = u.id
        INNER JOIN "Grade" g ON c."gradeId" = g.id
        INNER JOIN "Subject" s ON c."subjectId" = s.id
        LEFT JOIN course_review_stats crs ON c.id = crs."courseId"
        LEFT JOIN course_lecture_count clc ON c.id = clc."courseId"
        LEFT JOIN course_student_count csc ON c.id = csc."courseId"
        LEFT JOIN course_sales cs ON c.id = cs."productId"
      ),
      
      most_popular_courses AS (
        SELECT 
          id, thumbnail, "courseName", "coursePrice", "courseType",
          "teacherId", "teacherName", "teacherProfilePicture",
          "gradeName", "subjectName", "numberOfReviews", "avgRating",
          "numberOfLectures", "numberOfStudents"
        FROM courses_base
        ORDER BY sales_count DESC, id
        LIMIT 3
      ),
      
      latest_courses AS (
        SELECT 
          id, thumbnail, "courseName", "coursePrice", "courseType",
          "teacherId", "teacherName", "teacherProfilePicture",
          "gradeName", "subjectName", "numberOfReviews", "avgRating",
          "numberOfLectures", "numberOfStudents"
        FROM courses_base
        ORDER BY "createdAt" DESC
        LIMIT 3
      ),
      
      course_count AS (
        SELECT COUNT(*)::int as count FROM "Course"
      ),
      
      book_review_stats AS (
        SELECT 
          r."bookId",
          COUNT(*)::int as review_count,
          ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
        FROM "Review" r
        WHERE r."productType" = 'BOOK'
        GROUP BY r."bookId"
      ),
      
      book_order_count AS (
        SELECT 
          oi."productId",
          COUNT(*)::int as order_count
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON oi."orderId" = o.id
        WHERE oi."productType" = 'BOOK' AND o.status = 'COMPLETED'
        GROUP BY oi."productId"
      ),
      
      book_data AS (
        SELECT 
          b.id,
          b.thumbnail,
          b."bookName",
          b.description,
          b."bookFeatures",
          b.price::float as "bookPrice",
          u."displayName" as "teacherName",
          u."profilePicture" as "teacherProfilePicture",
          u.id as "teacherId",
          g.name as "gradeName",
          s.name as "subjectName",
          g.id as "gradeId",
          COALESCE(brs.review_count, 0)::int as "numberOfReviews",
          COALESCE(brs.avg_rating, 0)::float as "avgRating",
          COALESCE(boc.order_count, 0)::int as "numberOfOrders"
        FROM "Book" b
        INNER JOIN "Teacher" t ON b."teacherId" = t.id
        INNER JOIN "User" u ON t.id = u.id
        INNER JOIN "Grade" g ON b."gradeId" = g.id
        LEFT JOIN "Subject" s ON b."subjectId" = s.id
        LEFT JOIN book_review_stats brs ON b.id = brs."bookId"
        LEFT JOIN book_order_count boc ON b.id = boc."productId"
        WHERE random() < 0.5
        ORDER BY random()
        LIMIT 6
      ),
      
      book_divisions AS (
        SELECT 
          bd."bookId",
          jsonb_agg(
            jsonb_build_object('id', d.id, 'name', d.name)
            ORDER BY d.name
          ) as divisions
        FROM (
          SELECT "A" as "bookId", "B" as "divisionId" FROM "_BookToDivision"
        ) bd
        INNER JOIN "Division" d ON bd."divisionId" = d.id
        WHERE bd."bookId" IN (SELECT id FROM book_data)
        GROUP BY bd."bookId"
      ),
      
      books_section AS (
        SELECT 
          bd.id,
          bd.thumbnail,
          bd."bookName",
          bd.description,
          bd."bookFeatures",
          bd."bookPrice",
          bd."teacherName",
          bd."teacherProfilePicture",
          bd."teacherId",
          bd."gradeName",
          bd."subjectName",
          bd."numberOfReviews",
          bd."avgRating",
          bd."numberOfOrders",
          jsonb_build_object('id', bd."gradeId", 'name', bd."gradeName") as grade,
          COALESCE(bdiv.divisions, '[]'::jsonb) as divisions
        FROM book_data bd
        LEFT JOIN book_divisions bdiv ON bd.id = bdiv."bookId"
      )
      
      SELECT 
        jsonb_build_object(
          'numberOfStudents', (SELECT "numberOfStudents" FROM hero_stats),
          'avgQuizSuccessRate', (SELECT "avgQuizSuccessRate" FROM hero_stats),
          'numberOfTeachers', (SELECT "numberOfTeachers" FROM hero_stats),
          'avgRating', (SELECT "avgRating" FROM hero_stats),
          'randomSubjects', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]'::jsonb) FROM hero_random_subjects)
        ) as "heroSection",
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', id,
            'name', name,
            'numberOfLectures', "numberOfLectures",
            'numberOfHours', "numberOfHours",
            'avgRating', "avgRating"
          )
        ), '[]'::jsonb) FROM subjects_section) as "subjectsSection",
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'subjectId', "subjectId",
            'subjectName', "subjectName",
            'teachers', teachers
          )
        ), '[]'::jsonb) FROM teachers_grouped) as "teachersSection",
        jsonb_build_object(
          'mostPopular', (SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', id,
              'thumbnail', thumbnail,
              'courseName', "courseName",
              'coursePrice', "coursePrice",
              'courseType', "courseType",
              'teacherId', "teacherId",
              'teacherName', "teacherName",
              'teacherProfilePicture', "teacherProfilePicture",
              'gradeName', "gradeName",
              'subjectName', "subjectName",
              'numberOfReviews', "numberOfReviews",
              'avgRating', "avgRating",
              'numberOfLectures', "numberOfLectures",
              'numberOfStudents', "numberOfStudents"
            )
          ), '[]'::jsonb) FROM most_popular_courses),
          'latest', (SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', id,
              'thumbnail', thumbnail,
              'courseName', "courseName",
              'coursePrice', "coursePrice",
              'courseType', "courseType",
              'teacherId', "teacherId",
              'teacherName', "teacherName",
              'teacherProfilePicture', "teacherProfilePicture",
              'gradeName', "gradeName",
              'subjectName', "subjectName",
              'numberOfReviews', "numberOfReviews",
              'avgRating', "avgRating",
              'numberOfLectures', "numberOfLectures",
              'numberOfStudents', "numberOfStudents"
            )
          ), '[]'::jsonb) FROM latest_courses),
          'numberOfCourses', (SELECT count FROM course_count)
        ) as "coursesSection",
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', id,
            'thumbnail', thumbnail,
            'bookName', "bookName",
            'description', description,
            'bookFeatures', "bookFeatures",
            'bookPrice', "bookPrice",
            'teacherName', "teacherName",
            'teacherProfilePicture', "teacherProfilePicture",
            'teacherId', "teacherId",
            'gradeName', "gradeName",
            'subjectName', "subjectName",
            'numberOfReviews', "numberOfReviews",
            'avgRating', "avgRating",
            'numberOfOrders', "numberOfOrders",
            'grade', grade,
            'divisions', divisions
          )
        ), '[]'::jsonb) FROM books_section) as "booksSection"
    `;

    const data = result[0];

    return {
      heroSection: data.heroSection,
      subjectsSection: data.subjectsSection,
      teachersSection: data.teachersSection,
      coursesSection: data.coursesSection,
      booksSection: data.booksSection,
    };
  }
  async getAdminFilters() {
    const data = await this.getSignUpData(UserType.TEACHER);
    const schoolTypes = await this.prisma.schoolType.findMany();
    return {
      ...data,
      schoolTypes,
    };
  }
}
