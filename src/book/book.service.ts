import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBookDto } from './dto/create-book-dto';
import { PrismaService } from 'src/prisma.service';
import { ImageService } from 'src/common/services/image.service';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { S3Service } from 'src/s3/s3.service';
import { UpdateBookDto } from './dto/update-book-dto';

@Injectable()
export class BookService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly imageService: ImageService,
    private readonly handleFiles: HandleFiles,
  ) {}
  async createBook(
    teacherId: number,
    body: CreateBookDto,
    thumbnail: Express.Multer.File,
  ) {
    return await this.prisma.$transaction(async (prisma) => {
      const compressedThumbnail = await this.imageService.compressImage(
        thumbnail,
        {},
        80,
      );
      const { url } = await this.s3Service.uploadSingleFile({
        file: compressedThumbnail,
        folder: `books/teacher-${teacherId}/${this.handleFiles.sanitizeFileName(body.bookName)}`,
      });

      const book = await prisma.book.create({
        data: {
          ...body,
          teacherId: teacherId,
          thumbnail: url,
        },
      });
      return book;
    });
  }

  async deleteBook(teacherId: number, bookId: number) {
    return await this.prisma.$transaction(async (prisma) => {
      const existingBook = await prisma.book.findFirst({
        where: {
          id: bookId,
          teacherId: teacherId,
        },
      });

      if (!existingBook) {
        throw new NotFoundException(
          'الكتاب غير موجود أو ليس لديك صلاحية لحذفه',
        );
      }

      if (existingBook.thumbnail) {
        await this.s3Service.deleteFileByUrl(existingBook.thumbnail);
      }

      await prisma.book.delete({
        where: {
          id: bookId,
        },
      });
    });
  }
  async updateBook(
    teacherId: number,
    bookId: number,
    updateBookDto: UpdateBookDto,
    thumbnail?: Express.Multer.File,
  ) {
    return await this.prisma.$transaction(async (prisma) => {
      const existingBook = await prisma.book.findFirst({
        where: {
          id: bookId,
          teacherId: teacherId,
        },
      });

      if (!existingBook) {
        throw new NotFoundException(
          'الكتاب غير موجود أو ليس لديك صلاحية لتعديله',
        );
      }

      const filteredData = Object.fromEntries(
        Object.entries(updateBookDto).filter(
          ([, value]) => value !== undefined,
        ),
      );

      if (thumbnail) {
        if (existingBook.thumbnail) {
          await this.s3Service.deleteFileByUrl(existingBook.thumbnail);
        }
        const compressedThumbnail = await this.imageService.compressImage(
          thumbnail,
          {},
          70,
        );
        const thumbnailUrl = await this.s3Service.uploadSingleFile({
          file: compressedThumbnail,
          isPublic: true,
          folder: `books/teacher-${teacherId}/${this.handleFiles.sanitizeFileName(existingBook.bookName)}`,
        });
        filteredData.thumbnail = thumbnailUrl.url;
      }

      await prisma.book.update({
        where: { id: bookId },
        data: filteredData,
      });
    });
  }
  async getBooksByTeacher(teacherId: number) {
    return await this.prisma.book.findMany({
      where: {
        teacherId: teacherId,
      },
      include: {
        grade: true,
        division: true,
        teacher: {
          include: {
            user: {
              select: {
                displayName: true,
                profilePicture: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getBookById(bookId: number) {
    const book = await this.prisma.book.findUnique({
      where: {
        id: bookId,
      },
      include: {
        grade: true,
        division: true,
        teacher: {
          include: {
            user: {
              select: {
                displayName: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException('الكتاب غير موجود');
    }

    return book;
  }
}
