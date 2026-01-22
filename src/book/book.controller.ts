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
import { BookService } from './book.service';
import { CreateBookDto } from './dto/create-book-dto';
import { GetBooksDto } from './dto/get-books.dto';
import { GetTeacherBooksDto } from './dto/get-teacher-books.dto';
import { UpdateBookDto } from './dto/update-book-dto';

@ApiTags('book')
@ApiBearerAuth('accessToken')
@Controller('book')
export class BookController {
  constructor(private readonly bookService: BookService) {}

  @Roles(Role.TEACHER, Role.STUDENT)
  @Get(`get-ownership-status/:id`)
  getOwnershipStatus(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.bookService.getOwnershipStatus(req.user.id, id);
  }
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
  @Get('teacher-books')
  getBooksForTeacher(@Req() req, @Query() query: GetTeacherBooksDto) {
    return this.bookService.getBooksForTeacher(req.user.id, query);
  }
  @Roles(Role.TEACHER)
  @Get('update-data/:bookId')
  getBookForUpdate(@Req() req, @Param('bookId', ParseIntPipe) bookId: number) {
    return this.bookService.getBookForUpdate(req.user.id, bookId);
  }

  @Roles(Role.TEACHER)
  @Get('my-books')
  getMyBooks(@Req() req) {
    return this.bookService.getBooksByTeacher(req.user.id);
  }
  @Public()
  @Get('/ids/all-books')
  getAllBooksIds() {
    return this.bookService.getAllBooksIds();
  }
  @Public()
  @Get('all-books')
  getAllBooks(@Query() query: GetBooksDto) {
    return this.bookService.getBooks(query);
  }
  @Public()
  @Get(':id')
  getBook(@Param('id', ParseIntPipe) id: number) {
    return this.bookService.getBook(id);
  }

  @Public()
  @Get('related-books/:id')
  getRelatedBooks(@Param('id', ParseIntPipe) id: number) {
    return this.bookService.getRelatedBooks(id);
  }
}
