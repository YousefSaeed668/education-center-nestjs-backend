import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { CreateWithdrawRequestDto } from 'src/user/dto/create-withdraw-request.dto';
import { GetStudentCoursesDto } from './dto/get-student-courses.dto';
import { GetStudentInvoicesDto } from './dto/get-student-invoices.dto';
import { GetStudentStatisticsDto } from './dto/get-student-statistics.dto';
import { RechargeBalanceDto } from './dto/reacharge-balance.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { StudentService } from './student.service';

@ApiTags('student')
@ApiBearerAuth('accessToken')
@Controller('student')
@Roles(Role.STUDENT)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Put('update-profile')
  @UseInterceptors(FileInterceptor('profilePicture'))
  updateProfile(
    @Req() req,
    @Body() body: UpdateStudentProfileDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.studentService.updateProfile(req.user.id, body, file);
  }

  @Post('recharge-balance')
  rechargeBalance(@Req() req, @Body() body: RechargeBalanceDto) {
    return this.studentService.rechargeBalance(req.user.id, body.amount);
  }

  @Post('withdraw-request')
  withdrawRequest(@Req() req, @Body() body: CreateWithdrawRequestDto) {
    return this.studentService.createWithdrawRequest(req.user.id, body);
  }

  @Get('get-addresses')
  getAddresses(@Req() req) {
    return this.studentService.getAddresses(req.user.id);
  }

  @Get('info-for-update')
  studentInfoForUpdate(@Req() req) {
    return this.studentService.getStudentProfileForUpdate(req.user.id);
  }

  @Get('my-courses')
  getMyCourses(@Req() req, @Query() query: GetStudentCoursesDto) {
    return this.studentService.getMyCourses(req.user.id, query);
  }

  @Get('my-invoices')
  getMyInvoices(@Req() req, @Query() query: GetStudentInvoicesDto) {
    return this.studentService.getMyInvoices(req.user.id, query);
  }

  @Get('get-statistics')
  getStatistics(@Req() req, @Query() query: GetStudentStatisticsDto) {
    return this.studentService.getStudentStatistics(
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }
}
