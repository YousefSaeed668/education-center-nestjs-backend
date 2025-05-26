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
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
export enum Gender {
  Male = 'ذكر',
  Female = 'انثى',
}

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(20, { message: 'Username must not exceed 20 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
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

  @IsArray({ message: 'Division must be an array of IDs' })
  @ArrayNotEmpty({ message: 'At least one division must be selected' })
  @ArrayMinSize(1, { message: 'Select at least one division' })
  @IsInt({ each: true, message: 'Each grade ID must be an integer' })
  divisionIds: number[];

  @IsArray({ message: 'Grade must be an array of IDs' })
  @ArrayNotEmpty({ message: 'At least one grade must be selected' })
  @ArrayMinSize(1, { message: 'Select at least one grade' })
  @IsInt({ each: true, message: 'Each grade ID must be an integer' })
  gradeIds: number[];

  @IsInt()
  educationTypeId: number;
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
