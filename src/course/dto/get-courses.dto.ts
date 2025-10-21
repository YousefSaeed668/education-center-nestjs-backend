import { CourseType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
export interface CourseQueryResult {
  id: number;
  thumbnail: string;
  courseName: string;
  coursePrice: number;
  teacherId: number;
  teacherName: string;
  teacherProfilePicture: string;
  gradeName: string;
  subjectName: string;
  numberOfReviews: number;
  avgRating: number;
  numberOfLectures: number;
  numberOfStudents: number;
  courseType: CourseType;
}
export enum CourseSortBy {
  RATING = 'rating',
  PRICE = 'price',
  STUDENTS_COUNT = 'studentsCount',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetCoursesDto {
  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  teacherId?: number;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  gradeId?: number;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  divisionId?: number;

  @Min(1)
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  subjectId?: number;

  @IsString()
  @IsOptional()
  q?: string;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(CourseSortBy)
  sortBy?: CourseSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number;
}

export interface Quiz {
  id: number;
  title: string;
  isActive: boolean;
  orderIndex: number;
  description: string;
  maxAttempts: number;
}

export type ContentType = 'FILE' | 'VIDEO';

export interface LectureContent {
  id: number;
  duration: number | null;
  orderIndex: number;
  contentName: string;
  contentType: ContentType;
}

export interface Lecture {
  id: number;
  quizzes: Quiz[];
  orderIndex: number;
  totalItems: number;
  lectureName: string;
  lectureContent: LectureContent[];
  totalDuration: number;
  videoCount: number;
  fileCount: number;
  quizCount: number;
  formattedDuration: string;
}

export interface CourseRowTeacher {
  id: number;
  teacherName: string;
  teacherProfilePicture: string;
  teacherBio: string;
  teacherSubject: string;
  teacherRating: number;
  teacherTotalStudents: number;
  teacherTotalCourses: number;
}

export interface CourseRow {
  courseName: string;
  description: string;
  price: number;
  courseFeatures: string[];
  teacher: CourseRowTeacher;
  owned: boolean;
  courseRating: number;
  studentsCount: number;
  lecturesCount: number;
  quizzesCount: number;
  lectures: Lecture[];
}
