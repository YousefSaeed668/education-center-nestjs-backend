import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UpdateReviewDto } from './dto/update-review.dto';
import { AddReviewDto } from './dto/add-review.dto';

@Controller('reviews')
@Roles(Role.STUDENT)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('add/:courseId')
  addReview(
    @Req() req,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() body: AddReviewDto,
  ) {
    return this.reviewService.addReview(req.user.id, courseId, body);
  }

  @Put('update/:id')
  updateReview(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateReviewDto,
  ) {
    return this.reviewService.updateReview(req.user.id, id, body);
  }

  @Delete('delete/:id')
  deleteReview(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.reviewService.deleteReview(req.user.id, id);
  }
}
