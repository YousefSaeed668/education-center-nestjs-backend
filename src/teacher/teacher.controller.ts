import {
  Body,
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { S3Service } from 'src/s3/s3.service';

@Controller('teacher')
@Roles('TEACHER')
export class TeacherController {
  constructor(
    private readonly teacherService: TeacherService,
    private readonly s3Service: S3Service,
  ) {}
  @Post('update-profile')
  @UseInterceptors(FileInterceptor('file'))
  updateProfile(
    @Req() req,
    @Body() body: UpdateTeacherProfileDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }),
          new FileTypeValidator({ fileType: 'image/*' }),
        ],
        fileIsRequired: false,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.teacherService.updateProfile(req.user.id, body, file);
  }
}
