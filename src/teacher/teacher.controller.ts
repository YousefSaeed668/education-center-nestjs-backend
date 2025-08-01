import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { TeacherService } from './teacher.service';
import { CreateWithdrawRequestDto } from 'src/user/dto/create-withdraw-request.dto';
import { GetFinancialStatisticsDto } from 'src/admin/dto/get-financial-statistics.dto';

@Controller('teacher')
@Roles(Role.TEACHER)
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Post('update-profile')
  @UseInterceptors(FileInterceptor('file'))
  updateProfile(
    @Req() req,
    @Body() body: UpdateTeacherProfileDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.teacherService.updateProfile(req.user.id, body, file);
  }

  @Post('withdraw-request')
  withdrawRequest(@Req() req, @Body() body: CreateWithdrawRequestDto) {
    return this.teacherService.createWithdrawRequest(req.user.id, body);
  }
  @Get('get-earning')
  getEarning(@Req() req, @Query() query: GetFinancialStatisticsDto) {
    return this.teacherService.getTeacherEarnings(
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }
}
