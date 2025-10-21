import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { UserService } from 'src/user/user.service';
import refreshConfig from './config/refresh.token';
import {
  CreateStudentDto,
  CreateTeacherDto,
  CreateUserDto,
} from './dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly s3Service: S3Service,
    @Inject(refreshConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshConfig>,
  ) {}
  private async checkUserConflicts(userName: string, phoneNumber: string) {
    const [userByUsername, userByPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { userName } }),
      this.prisma.user.findUnique({ where: { phoneNumber } }),
    ]);

    if (userByUsername && userByPhone) {
      throw new ConflictException('اسم المستخدم ورقم الهاتف محجوزان بالفعل');
    }

    if (userByUsername) {
      throw new ConflictException('اسم المستخدم هذا محجوز بالفعل');
    }

    if (userByPhone) {
      throw new ConflictException('رقم الهاتف هذا محجوز بالفعل');
    }

    return null;
  }

  async signupStudent(
    createStudentDto: CreateStudentDto,
    file?: Express.Multer.File,
  ) {
    await this.checkUserConflicts(
      createStudentDto.userName,
      createStudentDto.phoneNumber,
    );

    let profilePictureUrl: string | undefined;

    try {
      if (file) {
        profilePictureUrl = await this.userService.handleProfilePictureUpdate(
          null,
          file,
          'student/profile-picture',
        );
      }

      const { password, ...data } = createStudentDto;
      const hashedPassword = await bcrypt.hash(password, 10);
      const { displayName, userName, gender, phoneNumber, ...studentData } =
        data;

      const newStudent = await this.prisma.user.create({
        omit: {
          password: true,
        },
        data: {
          displayName,
          userName,
          gender,
          phoneNumber,
          password: hashedPassword,
          ...(profilePictureUrl && { profilePicture: profilePictureUrl }),
          student: {
            create: {
              ...studentData,
              Cart: {
                create: {},
              },
            },
          },
        },
      });

      return newStudent;
    } catch (error) {
      if (profilePictureUrl) {
        await this.s3Service.deleteFileByUrl(profilePictureUrl).catch(() => {
          console.error('Failed to cleanup uploaded file:', profilePictureUrl);
        });
      }
      throw error;
    }
  }
  async signupTeacher(
    createTeacherDto: CreateTeacherDto,
    file?: Express.Multer.File,
  ) {
    await this.checkUserConflicts(
      createTeacherDto.userName,
      createTeacherDto.phoneNumber,
    );

    let profilePictureUrl: string | undefined;

    try {
      if (file) {
        profilePictureUrl = await this.userService.handleProfilePictureUpdate(
          null,
          file,
          'teacher/profile-picture',
        );
      }

      const {
        password,
        displayName,
        userName,
        gender,
        phoneNumber,
        subjectId,
        educationTypeId,
        divisionIds,
        gradeIds,
      } = createTeacherDto;
      const hashedPassword = await bcrypt.hash(password, 10);

      const newTeacher = await this.prisma.user.create({
        omit: {
          password: true,
        },
        data: {
          displayName,
          userName,
          gender,
          phoneNumber,
          password: hashedPassword,
          role: 'TEACHER',
          ...(profilePictureUrl && { profilePicture: profilePictureUrl }),
          teacher: {
            create: {
              subjectId,
              educationTypeId,
              division: {
                connect: divisionIds.map((id) => ({ id })),
              },
              grade: {
                connect: gradeIds.map((id) => ({ id })),
              },
            },
          },
        },
      });
      return newTeacher;
    } catch (error) {
      if (profilePictureUrl) {
        await this.s3Service.deleteFileByUrl(profilePictureUrl).catch(() => {
          console.error('Failed to cleanup uploaded file:', profilePictureUrl);
        });
      }
      throw error;
    }
  }
  async signupGuardian(
    CreateGuardianDto: CreateUserDto,
    file?: Express.Multer.File,
  ) {
    await this.checkUserConflicts(
      CreateGuardianDto.userName,
      CreateGuardianDto.phoneNumber,
    );
    const studentsWithThisPhone = await this.prisma.student.findMany({
      where: { parentPhoneNumber: CreateGuardianDto.phoneNumber },
    });

    if (studentsWithThisPhone.length === 0) {
      throw new BadRequestException(
        'لم يتم العثور على أي طالب بهذا الرقم. يجب على الطلاب التسجيل أولاً.',
      );
    }

    let profilePictureUrl: string | undefined;

    try {
      if (file) {
        profilePictureUrl = await this.userService.handleProfilePictureUpdate(
          null,
          file,
          'guardian/profile-picture',
        );
      }

      const { password, ...data } = CreateGuardianDto;
      const hashedPassword = await bcrypt.hash(password, 10);
      const { displayName, userName, gender, phoneNumber } = data;
      const newGuardian = await this.prisma.user.create({
        omit: {
          password: true,
        },
        data: {
          displayName,
          userName,
          gender,
          phoneNumber,
          password: hashedPassword,
          role: 'GUARDIAN',
          ...(profilePictureUrl && { profilePicture: profilePictureUrl }),
          guardian: {
            create: {
              phoneNumber,
            },
          },
        },
      });
      return newGuardian;
    } catch (error) {
      if (profilePictureUrl) {
        await this.s3Service.deleteFileByUrl(profilePictureUrl).catch(() => {
          console.error('Failed to cleanup uploaded file:', profilePictureUrl);
        });
      }
      throw error;
    }
  }
  async validateUser(userName: string, password: string) {
    const user = await this.userService.findUserByUsername(userName);
    if (!user) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    return {
      id: user.id,
      displayName: user.displayName,
      userName: user.userName,
      role: user.role,
    };
  }

  async login(
    userId: number,
    displayName: string,
    userName: string,
    role: Role,
  ) {
    const { accessToken, refreshToken } = await this.generateTokens(userId);
    const hashedRt = await bcrypt.hash(refreshToken, 10);
    await this.userService.updateHashedRefreshToken(userId, hashedRt);
    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        displayName,
        userName,
        role,
      },
    };
  }

  async generateTokens(userId: number) {
    const payload = { sub: userId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, this.refreshTokenConfig),
    ]);

    return { accessToken, refreshToken };
  }
  async validateJwtUser(id: number) {
    const user = await this.userService.findUserById(id);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return {
      id: user.id,
      role: user.role,
    };
  }
  async validateRefreshToken(userId: number, refreshToken: string) {
    const user = await this.userService.findUserById(userId);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const refreshTokenMatched = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!refreshTokenMatched)
      throw new UnauthorizedException('Invalid credentials');
    const currentUser = { id: user.id };
    return currentUser;
  }
  async refreshToken(userId: number) {
    const { accessToken, refreshToken } = await this.generateTokens(userId);
    const hashedRT = await bcrypt.hash(refreshToken, 10);
    await this.userService.updateHashedRefreshToken(userId, hashedRT);
    return { id: userId, accessToken, refreshToken };
  }
  async signOut(userId: number) {
    return await this.userService.updateHashedRefreshToken(userId, null);
  }
}
