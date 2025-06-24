import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';

@Controller('course')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}
  @Roles(Role.TEACHER)
  getAllCourses() {}

  @UseInterceptors(FileInterceptor('thumbnail'))
  @Roles(Role.TEACHER)
  @Post('create-course')
  createCourse(
    @Req() req,
    @Body() body: CreateCourseDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: true,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }),
    )
    thumbnail: Express.Multer.File,
  ) {
    return this.courseService.createCourse(req.user.id, body, thumbnail);
  }

  @Roles(Role.TEACHER)
  @Put(':courseId')
  @UseInterceptors(FileInterceptor('thumbnail'))
  updateCourse(
    @Req() req,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() updateCourseDto: UpdateCourseDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/ }),
        ],
      }),
    )
    thumbnail?: Express.Multer.File,
  ) {
    return this.courseService.updateCourse(
      req.user.id,
      courseId,
      updateCourseDto,
      thumbnail,
    );
  }

  @Roles(Role.TEACHER)
  @Delete(':courseId')
  deleteCourse(@Req() req, @Param('courseId', ParseIntPipe) courseId: number) {
    return this.courseService.deleteCourse(req.user.id, courseId);
  }
}
