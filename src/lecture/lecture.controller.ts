import {
  Body,
  Controller,
  Delete,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  LectureFilesValidationPipe,
  LectureUploadValidationPipe,
} from 'src/pipes/file-validation.pipe';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';
import { LectureService } from './lecture.service';

@Controller('lecture')
export class LectureController {
  constructor(private readonly lectureService: LectureService) {}
  @Roles(Role.TEACHER)
  @Post('create-lecture')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'files', maxCount: 10 },
      { name: 'thumbnail', maxCount: 1 },
    ]),
  )
  createLecture(
    @Req() req,
    @Body()
    body: CreateLectureDto,
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
      LectureUploadValidationPipe,
    )
    validatedFiles: {
      files: Express.Multer.File[];
      thumbnail?: Express.Multer.File;
    },
  ) {
    return this.lectureService.createLecture(
      req.user.id,
      body,
      validatedFiles.files,
      validatedFiles.thumbnail,
    );
  }

  @Roles(Role.TEACHER)
  @Put(':lectureId')
  @UseInterceptors(FilesInterceptor('files', 10))
  updateLecture(
    @Req() req,
    @Param('lectureId', ParseIntPipe) lectureId: number,
    @Body()
    updateLectureDto: UpdateLectureDto,
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: false,
      }),
      LectureFilesValidationPipe,
    )
    files: Express.Multer.File[],
  ) {
    return this.lectureService.updateLecture(
      req.user.id,
      lectureId,
      updateLectureDto,
      files,
    );
  }

  @Roles(Role.TEACHER)
  @Delete(':lectureId')
  deleteLecture(
    @Req() req,
    @Param('lectureId', ParseIntPipe) lectureId: number,
  ) {
    return this.lectureService.deleteLecture(req.user.id, lectureId);
  }
}
