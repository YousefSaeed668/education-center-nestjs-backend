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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductType, Role } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { AddReviewDto } from './dto/add-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewService } from './review.service';

@ApiTags('review')
@ApiBearerAuth('accessToken')
@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Public()
  @Get('/course/:id')
  getCourseReviewsPublic(
    @Param('id', ParseIntPipe) courseId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.reviewService.getReviews(ProductType.COURSE, courseId, cursor);
  }

  @Public()
  @Get('/book/:id')
  getBookReviewsPublic(
    @Param('id', ParseIntPipe) bookId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.reviewService.getReviews(ProductType.BOOK, bookId, cursor);
  }

  @Roles(Role.STUDENT)
  @Get('/student/course/:id')
  getCourseReviewsForStudent(
    @Req() req,
    @Param('id', ParseIntPipe) courseId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.reviewService.getReviewsForStudent(
      ProductType.COURSE,
      courseId,
      req.user.id,
      cursor,
    );
  }

  @Roles(Role.STUDENT)
  @Get('/student/book/:id')
  getBookReviewsForStudent(
    @Req() req,
    @Param('id', ParseIntPipe) bookId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.reviewService.getReviewsForStudent(
      ProductType.BOOK,
      bookId,
      req.user.id,
      cursor,
    );
  }

  @Roles(Role.STUDENT)
  @Post('add/:productId')
  addReview(
    @Req() req,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: AddReviewDto,
  ) {
    return this.reviewService.addReview(req.user.id, productId, body);
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
