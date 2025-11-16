import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { GenerateUploadUrlsDto } from './dto/generate-upload-urls.dto';
import { GetTeacherLectureDto } from './dto/get-teacher-lecture.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';
import { LectureService } from './lecture.service';

@Controller('lecture')
export class LectureController {
  constructor(private readonly lectureService: LectureService) {}
  @Roles(Role.TEACHER)
  @Post('generate-upload-urls')
  generateUploadUrls(@Req() req, @Body() body: GenerateUploadUrlsDto) {
    return this.lectureService.generateUploadUrls(req.user.id, body);
  }
  @Roles(Role.TEACHER)
  @Post('create-lecture')
  @UseInterceptors(FileInterceptor('thumbnail'))
  createLecture(
    @Req() req,
    @Body()
    body: CreateLectureDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }),
    )
    thumbnail?: Express.Multer.File,
  ) {
    return this.lectureService.createLecture(req.user.id, body, thumbnail);
  }
  @Roles(Role.TEACHER)
  @Post('generate-upload-urls-for-update/:lectureId')
  generateUploadUrlsForUpdate(
    @Req() req,
    @Param('lectureId', ParseIntPipe) lectureId: number,
    @Body() body: { files: GenerateUploadUrlsDto['files'] },
  ) {
    return this.lectureService.generateUploadUrlsForUpdate(
      req.user.id,
      lectureId,
      body.files,
    );
  }
  @Roles(Role.TEACHER)
  @Put(':lectureId')
  updateLecture(
    @Req() req,
    @Param('lectureId', ParseIntPipe) lectureId: number,
    @Body()
    updateLectureDto: UpdateLectureDto,
  ) {
    return this.lectureService.updateLecture(
      req.user.id,
      lectureId,
      updateLectureDto,
    );
  }

  @Roles(Role.TEACHER)
  @Delete(':lectureId')
  deleteLecture(@Req() req, @Param('lectureId') lectureId: number) {
    return this.lectureService.deleteLecture(req.user.id, lectureId);
  }
  @Roles(Role.TEACHER)
  @Get('/update-data/:lectureId')
  getLectureDataForUpdate(
    @Req() req,
    @Param('lectureId', ParseIntPipe) lectureId: number,
  ) {
    return this.lectureService.getLectureDataForUpdate(req.user.id, lectureId);
  }
  @Roles(Role.TEACHER)
  @Get('teacher-lectures')
  getLecturesForTeacher(@Req() req, @Query() query: GetTeacherLectureDto) {
    return this.lectureService.getLecturesForTeacher(req.user.id, query);
  }
}
