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
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { AddReviewDto } from './dto/add-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewService } from './review.service';

@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Public()
  @Get('/:id')
  getReviewsPublic(
    @Param('id', ParseIntPipe) courseId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.reviewService.getReviews(courseId, cursor);
  }

  @Roles(Role.STUDENT)
  @Get('/student/:id')
  getReviewsForStudent(
    @Req() req,
    @Param('id', ParseIntPipe) courseId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.reviewService.getReviewsForStudent(
      courseId,
      req.user.id,
      cursor,
    );
  }

  @Roles(Role.STUDENT)
  @Post('add/:courseId')
  addReview(
    @Req() req,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() body: AddReviewDto,
  ) {
    return this.reviewService.addReview(req.user.id, courseId, body);
  }

  @Roles(Role.STUDENT)
  @Put('update/:id')
  updateReview(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateReviewDto,
  ) {
    return this.reviewService.updateReview(req.user.id, id, body);
  }

  @Roles(Role.STUDENT)
  @Delete('delete/:id')
  deleteReview(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.reviewService.deleteReview(req.user.id, id);
  }
}
