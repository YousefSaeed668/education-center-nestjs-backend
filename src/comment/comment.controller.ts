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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { CommentService } from './comment.service';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('comment')
@ApiBearerAuth('accessToken')
@Controller('comment')
@Roles(Role.STUDENT, Role.TEACHER)
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Public()
  @Get('get-replies/:id')
  getCommentReplies(
    @Param('id', ParseIntPipe) id: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.commentService.getCommentReplies(id, cursor);
  }

  @Post('add/:id')
  @UseInterceptors(FileInterceptor('image'))
  addComment(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AddCommentDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
      }),
    )
    image?: Express.Multer.File,
  ) {
    return this.commentService.addComment(
      req.user.id,
      req.user.role,
      id,
      body,
      image,
    );
  }

  @Put('update/:id')
  @UseInterceptors(FileInterceptor('image'))
  updateComment(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCommentDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
      }),
    )
    image?: Express.Multer.File,
  ) {
    return this.commentService.updateComment(
      req.user.id,
      req.user.role,
      id,
      body,
      image,
    );
  }

  @Delete('delete/:id')
  deleteComment(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.commentService.deleteComment(req.user.id, req.user.role, id);
  }

  @Public()
  @Get('get-comments/:id')
  getByCourseId(
    @Param('id', ParseIntPipe) id: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.commentService.getByCourseId(id, cursor);
  }
}
