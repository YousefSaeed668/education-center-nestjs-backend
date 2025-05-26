import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateStudentDto,
  CreateTeacherDto,
  CreateUserDto,
} from './dto/create-user.dto';
import { PrismaService } from 'src/prisma.service';
import { UserService } from 'src/user/user.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import refreshConfig from './config/refresh.token';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @Inject(refreshConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshConfig>,
  ) {}
  async signupStudent(createStudentDto: CreateStudentDto) {
    const user = await this.userService.findUserByUsername(
      createStudentDto.userName,
    );
    if (user) {
      throw new ConflictException('This username is already taken');
    }
    const { password, ...data } = createStudentDto;
    const hashedPassword = await bcrypt.hash(password, 10);
    const { displayName, userName, gender, phoneNumber, ...studentData } = data;

    const newStudent = await this.prisma.user.create({
      data: {
        displayName,
        userName,
        gender,
        phoneNumber,
        password: hashedPassword,
        student: {
          create: {
            ...studentData,
          },
        },
      },
    });

    return newStudent;
  }
  async signupTeacher(createTeacherDto: CreateTeacherDto) {
    const user = await this.userService.findUserByUsername(
      createTeacherDto.userName,
    );
    if (user) {
      throw new ConflictException('This username is already taken');
    }
    const {
      password,
      displayName,
      userName,
      gender,
      phoneNumber,
      subject,
      educationTypeId,
      divisionIds,
      gradeIds,
    } = createTeacherDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newTeacher = await this.prisma.user.create({
      data: {
        displayName,
        userName,
        gender,
        phoneNumber,
        password: hashedPassword,
        role: 'TEACHER',
        Teacher: {
          create: {
            subject,
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
  }
  async signupGuardian(CreateGuardianDto: CreateUserDto) {
    const user = await this.userService.findUserByUsername(
      CreateGuardianDto.userName,
    );
    if (user) {
      throw new ConflictException('This username is already taken');
    }
    const studentsWithThisPhone = await this.prisma.student.findMany({
      where: { parentPhoneNumber: CreateGuardianDto.phoneNumber },
    });

    if (studentsWithThisPhone.length === 0) {
      throw new BadRequestException(
        'No students found with this phone number. Students must register first.',
      );
    }
    const { password, ...data } = CreateGuardianDto;
    const hashedPassword = await bcrypt.hash(password, 10);
    const { displayName, userName, gender, phoneNumber } = data;
    const newGuardian = await this.prisma.user.create({
      data: {
        displayName,
        userName,
        gender,
        phoneNumber,
        password: hashedPassword,
        role: 'GUARDIAN',
        Guardian: {
          create: {
            phoneNumber,
          },
        },
      },
    });
    return newGuardian;
  }
  async validateUser(userName: string, password: string) {
    const user = await this.userService.findUserByUsername(userName);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
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
