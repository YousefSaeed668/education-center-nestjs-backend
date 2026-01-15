import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class GetDashboardStatisticsDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export interface DashboardCardType {
  value: number;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
}

export interface RevenueChartItem {
  date: string;
  platformRevenue: number;
  teachersRevenue: number;
  orders: number;
}

export interface TopContentChartItem {
  id: number;
  name: string;
  type: 'course' | 'book';
  enrollments: number;
  revenue: number;
  avgRating: number;
  teacherName: string;
}

export interface RevenuePieChartItem {
  category: string;
  revenue: number;
  percentage: number;
}

export interface GrowthLineChartItem {
  date: string;
  newStudents: number;
  newTeachers: number;
  newOrders: number;
  newEnrollments: number;
}

export interface WithdrawalsChartItem {
  date: string;
  teacherWithdrawals: number;
  studentWithdrawals: number;
  pending: number;
  completed: number;
}

export interface OrdersStatusChartItem {
  status: string;
  count: number;
  percentage: number;
}

export interface TeacherPerformanceChartItem {
  teacherId: number;
  teacherName: string;
  revenue: number;
  coursesCount: number;
  booksCount: number;
}
