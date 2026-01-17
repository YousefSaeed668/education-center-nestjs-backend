import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum UserType {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  GUARDIAN = 'GUARDIAN',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum SortBy {
  CREATED_AT = 'createdAt',
  DISPLAY_NAME = 'displayName',
  BALANCE = 'balance',

  GRADE = 'grade',

  TOTAL_COURSES = 'totalCourses',
  TOTAL_BOOKS = 'totalBooks',
  EARNINGS = 'earnings',
  PLATFORM_SHARE = 'platformShare',

  STUDENTS_COUNT = 'studentsCount',
}

export class GetAllUsersDto {
  @IsEnum(UserType, {
    message: 'نوع المستخدم يجب ان يكون معلم أو طالب أو ولي امر',
  })
  userType: UserType;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.CREATED_AT;

  @IsOptional()
  @Type(() => Date)
  registrationDateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  registrationDateTo?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gradeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  schoolTypeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  educationTypeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  divisionId?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isGuardianVerified?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subjectId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => parseInt(v)) : [parseInt(value)],
  )
  @Type(() => Number)
  gradeIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minEarnings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxEarnings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPlatformShare?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPlatformShare?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasVerifiedStudents?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStudents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxStudents?: number;
}

export interface StudentUserResponse {
  id: number;
  displayName: string;
  userName: string;
  phoneNumber: string;
  gradeName: string;
  schoolTypeName: string;
  educationTypeName: string;
  isGuardianVerified: boolean;
  balance: number;
  createdAt: Date;
}

export interface TeacherUserResponse {
  id: number;
  displayName: string;
  userName: string;
  phoneNumber: string;
  subjectName: string;
  educationTypeName: string;
  totalCourses: number;
  totalBooks: number;
  earnings: number;
  balance: number;
  platformShare: number;
  createdAt: Date;
}

export interface GuardianUserResponse {
  id: number;
  displayName: string;
  userName: string;
  phoneNumber: string;
  linkedStudentsCount: number;
  verifiedStudentsCount: number;
  unverifiedStudentsCount: number;
  createdAt: Date;
}

export interface PaginatedResponse<T> {
  users: T[];
  total: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
}
