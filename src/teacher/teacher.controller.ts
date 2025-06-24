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
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { TeacherService } from './teacher.service';

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
