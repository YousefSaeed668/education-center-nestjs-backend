import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export enum UserTypeFilter {
  ALL = 'ALL',
  TEACHERS = 'TEACHERS',
  STUDENTS = 'STUDENTS',
  GUARDIANS = 'GUARDIANS',
}

export enum SortField {
  // Common fields
  DISPLAY_NAME = 'displayName',
  BALANCE = 'balance',
  WITHDRAWAL_COUNT = 'withdrawCount',
  CREATED_AT = 'createdAt',
  // Teacher specific
  TOTAL_REVENUE = 'totalRevenue',
  TOTAL_PROFIT = 'totalProfit',

  // Student specific
  NUMBER_OF_COURSES = 'numberOfCourses',
  TOTAL_SPENT = 'totalSpent',

  // Guardian specific
  LINKED_STUDENTS = 'linkedStudents',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetAllUsersDto {
  @IsOptional()
  @IsEnum(UserTypeFilter)
  userType?: UserTypeFilter = UserTypeFilter.ALL;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @IsOptional()
  @IsEnum(SortField)
  @ValidateIf((o) => {
    const commonFields = [
      SortField.DISPLAY_NAME,
      SortField.BALANCE,
      SortField.WITHDRAWAL_COUNT,
      SortField.CREATED_AT,
    ];

    if (o.userType === UserTypeFilter.ALL) {
      return commonFields.includes(o.sortBy);
    }

    if (o.userType === UserTypeFilter.TEACHERS) {
      const teacherFields = [
        ...commonFields,
        SortField.TOTAL_REVENUE,
        SortField.TOTAL_PROFIT,
      ];
      return teacherFields.includes(o.sortBy);
    }

    if (o.userType === UserTypeFilter.STUDENTS) {
      const studentFields = [
        ...commonFields,
        SortField.NUMBER_OF_COURSES,
        SortField.TOTAL_SPENT,
      ];
      return studentFields.includes(o.sortBy);
    }

    if (o.userType === UserTypeFilter.GUARDIANS) {
      const guardianFields = [...commonFields, SortField.LINKED_STUDENTS];
      return guardianFields.includes(o.sortBy);
    }

    return true;
  })
  sortBy?: SortField = SortField.DISPLAY_NAME;
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;

  // Balance filter (min-max range)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  balanceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  balanceMax?: number;

  // Teacher specific filters
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.TEACHERS)
  totalRevenueMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.TEACHERS)
  totalRevenueMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.TEACHERS)
  totalProfitMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.TEACHERS)
  totalProfitMax?: number;

  // Student specific filters
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.STUDENTS)
  numberOfCoursesMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.STUDENTS)
  numberOfCoursesMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.STUDENTS)
  totalSpentMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.userType === UserTypeFilter.STUDENTS)
  totalSpentMax?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @ValidateIf((o) => o.userType === UserTypeFilter.STUDENTS)
  onlyVerifiedGuardians?: boolean;

  // Guardian specific filters
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @ValidateIf((o) => o.userType === UserTypeFilter.GUARDIANS)
  onlyWithLinkedStudents?: boolean;
}
