import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { CreateWithdrawRequestDto } from 'src/user/dto/create-withdraw-request.dto';
import { RechargeBalanceDto } from './dto/reacharge-balance.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { StudentService } from './student.service';

@Controller('student')
@Roles(Role.STUDENT)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Post('update-profile')
  @UseInterceptors(FileInterceptor('file'))
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
}
