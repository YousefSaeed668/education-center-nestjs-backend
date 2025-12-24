import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { GetFinancialStatisticsDto } from 'src/admin/dto/get-financial-statistics.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { GetTeachersDto } from './dto/get-teachers.dto';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { TeacherService } from './teacher.service';

@Controller('teacher')
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Public()
  @Get('all-teachers')
  getAllTeachers(@Query() query: GetTeachersDto) {
    return this.teacherService.getTeachers(query);
  }

  @Roles(Role.TEACHER)
  @Put('update-profile')
  @UseInterceptors(FileInterceptor('profilePicture'))
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

  @Roles(Role.TEACHER)
  @Get('get-earning')
  getEarning(@Req() req, @Query() query: GetFinancialStatisticsDto) {
    return this.teacherService.getTeacherEarnings(
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }

  @Roles(Role.TEACHER)
  @Get('get-teacher-classes')
  getTeacherClasses(@Req() req) {
    return this.teacherService.getTeacherClasses(req.user.id);
  }

  @Roles(Role.TEACHER)
  @Get('info-for-update')
  teacherInfoForUpdate(@Req() req) {
    return this.teacherService.teacherInfoForUpdate(req.user.id);
  }
}
