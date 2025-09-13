import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import {
  CreateStudentDto,
  CreateTeacherDto,
  CreateUserDto,
} from './dto/create-user.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from './decorators/public.decorator';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseInterceptors(FileInterceptor('profilePicture'))
  @Post('/signup/student')
  signupStudent(
    @Body() body: CreateStudentDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.authService.signupStudent(body, file);
  }

  @Public()
  @UseInterceptors(FileInterceptor('profilePicture'))
  @Post('/signup/teacher')
  signupTeacher(
    @Body() body: CreateTeacherDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.authService.signupTeacher(body, file);
  }

  @Public()
  @UseInterceptors(FileInterceptor('profilePicture'))
  @Post('/signup/guardian')
  signupGuardian(
    @Body() body: CreateUserDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.authService.signupGuardian(body, file);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('/signin')
  login(@Req() req) {
    return this.authService.login(
      req.user.id,
      req.user.displayName,
      req.user.userName,
      req.user.role,
    );
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  @Post('/refresh')
  refreshToken(@Req() req) {
    return this.authService.refreshToken(req.user.id);
  }

  @Post('/signout')
  signOut(@Req() req) {
    return this.authService.signOut(req.user.id);
  }
}
