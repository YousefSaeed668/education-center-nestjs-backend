import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  CreateStudentDto,
  CreateTeacherDto,
  CreateUserDto,
} from './dto/create-user.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from './decorators/public.decorator';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('/signup/student')
  signupStudent(@Body() body: CreateStudentDto) {
    return this.authService.signupStudent(body);
  }

  @Public()
  @Post('/signup/teacher')
  signupTeacher(@Body() body: CreateTeacherDto) {
    return this.authService.signupTeacher(body);
  }

  @Public()
  @Post('/signup/guardian')
  signupGuardian(@Body() body: CreateUserDto) {
    return this.authService.signupGuardian(body);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
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
