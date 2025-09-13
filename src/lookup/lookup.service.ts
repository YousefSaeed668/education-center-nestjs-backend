import { Injectable } from '@nestjs/common';
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

  async getCoursesData() {
    const [subjects, grades, courseCount, teacherCount, studentCount] =
      await Promise.all([
        this.prisma.subject.findMany(),
        this.prisma.grade.findMany(),
        this.prisma.course.count(),
        this.prisma.teacher.count(),
        this.prisma.student.count(),
      ]);
    return {
      filters: {
        subjects,
        grades,
      },
      coursePageStats: {
        courseCount,
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
}
