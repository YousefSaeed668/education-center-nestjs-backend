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
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { GetCoursesDto } from './dto/get-courses.dto';
import { GetTeacherCoursesDto } from './dto/get-teacher-courses.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Controller('course')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}
  @Public()
  @Get('all-courses')
  getAllCourses(@Query() query: GetCoursesDto) {
    return this.courseService.getCourses(query);
  }
  @Roles(Role.TEACHER)
  @Get('teacher-courses')
  getCoursesForTeacher(@Req() req, @Query() query: GetTeacherCoursesDto) {
    return this.courseService.getCoursesForTeacher(req.user.id, query);
  }
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
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
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

  @Public()
  @Get('all-courses-ids')
  getAllCoursesIds() {
    return this.courseService.getAllCoursesIds();
  }

  @Public()
  @Get(':id')
  getCourse(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.getCourse(id);
  }

  @Roles(Role.STUDENT)
  @Get('get-ownership-status/:id')
  getOwnershipStatus(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.courseService.getOwnershipStatus(id, req.user.id);
  }
  @Public()
  @Get('relatedCourses/:id')
  getRelatedCourses(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.getRelatedCourses(id);
  }
  @Roles(Role.TEACHER)
  @Get('/update-data/:courseId')
  getLectureDataForUpdate(
    @Req() req,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.courseService.getCourseDataForUpdate(req.user.id, courseId);
  }
}
