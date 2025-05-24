import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';
export enum Gender {
  Male = 'ذكر',
  Female = 'انثى',
}

class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  userName: string;

  @IsPhoneNumber('EG')
  phoneNumber: string;

  @IsStrongPassword({
    minSymbols: 0,
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Name must be at least 8 characters long' })
  displayName: string;

  @IsEnum(Gender, { message: 'Gender must be one of: male, female' })
  gender: Gender;
}

export class CreateTeacherDto extends CreateUserDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsArray({ message: 'Devision must be an array of IDs' })
  @ArrayNotEmpty({ message: 'At least one devision must be selected' })
  @ArrayMinSize(1, { message: 'Select at least one devision' })
  @IsInt({ each: true, message: 'Each devision ID must be an integer' })
  devisionId: number[];

  @IsInt()
  departmentId: number;
}

export class CreateStudentDto extends CreateUserDto {
  @IsInt()
  @IsNotEmpty()
  governmentId: number;

  @IsInt()
  @IsNotEmpty()
  cityId: number;

  @IsNumber()
  educationTypeId: number;

  @IsInt()
  secondLangId: number;

  @IsInt()
  schoolTypeId: number;

  @IsInt()
  departmentId: number;

  @IsPhoneNumber('EG')
  parentPhoneNumber: string;

  @IsBoolean()
  isGurardianVerified: boolean;

  @IsInt()
  gradeId: number;

  @IsInt()
  devisionId: number;

  @IsString()
  @IsNotEmpty()
  schoolName: string;
}

export class CreateGuardianDto extends CreateUserDto {
  @IsPhoneNumber('EG')
  declare phoneNumber: string;
}
