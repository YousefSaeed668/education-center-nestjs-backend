import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { BookService } from './book.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateBookDto } from './dto/create-book-dto';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { UpdateBookDto } from './dto/update-book-dto';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('book')
export class BookController {
  constructor(private readonly bookService: BookService) {}

  @Roles(Role.TEACHER)
  @UseInterceptors(FileInterceptor('thumbnail'))
  @Post('create-book')
  createBook(
    @Req() req,
    @Body() body: CreateBookDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: true,
      }),
    )
    thumbnail: Express.Multer.File,
  ) {
    return this.bookService.createBook(req.user.id, body, thumbnail);
  }

  @Roles(Role.TEACHER)
  @Put(':bookId')
  @UseInterceptors(FileInterceptor('thumbnail'))
  updateBook(
    @Req() req,
    @Param('bookId', ParseIntPipe) bookId: number,
    @Body() updateBookDto: UpdateBookDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
      }),
    )
    thumbnail?: Express.Multer.File,
  ) {
    return this.bookService.updateBook(
      req.user.id,
      bookId,
      updateBookDto,
      thumbnail,
    );
  }

  @Roles(Role.TEACHER)
  @Delete(':bookId')
  deleteBook(@Req() req, @Param('bookId', ParseIntPipe) bookId: number) {
    return this.bookService.deleteBook(req.user.id, bookId);
  }

  @Roles(Role.TEACHER)
  @Get('my-books')
  getMyBooks(@Req() req) {
    return this.bookService.getBooksByTeacher(req.user.id);
  }
  @Public()
  @Get(':bookId')
  getBookById(@Param('bookId', ParseIntPipe) bookId: number) {
    return this.bookService.getBookById(bookId);
  }
}
