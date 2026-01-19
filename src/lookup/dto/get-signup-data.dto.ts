import { IsEnum } from 'class-validator';

export enum UserType {
  STUDENT = 'student',
  TEACHER = 'teacher',
}

export class GetSignUpDataDto {
  @IsEnum(UserType, {
    message: 'نوع المستخدم يجب ان يكون "student" او "teacher"',
  })
  userType: UserType;
}

export enum SettingType {
  minimumRechargeAmount = 'minimumRechargeAmount',
  minimumWithdrawAmount = 'minimumWithdrawAmount',
  teacherRegistration = 'teacherRegistration',
  platformPercentage = 'platformPercentage',
  all = 'all',
}
