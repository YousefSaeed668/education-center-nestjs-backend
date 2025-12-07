import { Injectable, NotFoundException } from '@nestjs/common';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateBookDto } from './dto/create-book-dto';
import {
  BooksSortBy,
  GetTeacherBooksDto,
  SortOrder,
} from './dto/get-teacher-books.dto';
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

      const { divisionIds, ...rest } = body;

      const book = await prisma.book.create({
        data: {
          ...rest,
          teacherId: teacherId,
          thumbnail: url,
          Division: {
            connect: divisionIds ? divisionIds.map((id) => ({ id })) : [],
          },
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

      const { divisionIds, ...rest } = updateBookDto;

      const filteredData: any = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined),
      );

      if (divisionIds) {
        filteredData.Division = {
          set: divisionIds.map((id) => ({ id })),
        };
      }

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

  async getBooksForTeacher(teacherId: number, query: GetTeacherBooksDto) {
    const { sortBy, sortOrder, pageNumber = 1, pageSize = 20, q } = query;

    const skip = (pageNumber - 1) * pageSize;

    const whereConditions: string[] = [`b."teacherId" = ${teacherId}`];

    if (q) {
      whereConditions.push(`b."bookName" ILIKE '%${q}%'`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    let orderByColumn = 'b."createdAt"';
    const order = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    if (sortBy) {
      switch (sortBy) {
        case BooksSortBy.CREATED_AT:
          orderByColumn = 'b."createdAt"';
          break;
        case BooksSortBy.BOOK_NAME:
          orderByColumn = 'b."bookName"';
          break;
        case BooksSortBy.PRICE:
          orderByColumn = 'b.price';
          break;
        case BooksSortBy.TOTAL_REVENUE:
          orderByColumn = 'COALESCE(br.total_revenue, 0)';
          break;
      }
    }

    const orderByClause = `ORDER BY ${orderByColumn} ${order}`;

    const [books, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          id: number;
          bookName: string;
          price: number;
          createdAt: Date;
          grade: { id: number; name: string };
          Division: Array<{ id: number; name: string }>;
          totalRevenue: number;
        }[]
      >(`
        WITH book_revenue AS (
          SELECT 
            oi."productId" as book_id,
            ROUND(COALESCE(SUM(t."teacherShare"), 0)::numeric, 2)::float as total_revenue
          FROM "OrderItem" oi
          INNER JOIN "Transaction" t ON t."orderItemId" = oi.id
          WHERE oi."productType" = 'BOOK'
          GROUP BY oi."productId"
        )
        SELECT 
          b.id,
          b."bookName",
          b.price::float as price,
          b."createdAt",
          jsonb_build_object('id', g.id, 'name', g.name) as "grade",
          COALESCE(
            jsonb_agg(
              DISTINCT jsonb_build_object('id', d.id, 'name', d.name)
            ) FILTER (WHERE d.id IS NOT NULL),
            '[]'::jsonb
          ) as "Division",
          COALESCE(br.total_revenue, 0)::float as "totalRevenue"
        FROM "Book" b
        INNER JOIN "Grade" g ON b."gradeId" = g.id
        LEFT JOIN "_BookToDivision" bd ON b.id = bd."A"
        LEFT JOIN "Division" d ON bd."B" = d.id
        LEFT JOIN book_revenue br ON b.id = br.book_id
        ${whereClause}
        GROUP BY 
          b.id, 
          b."bookName", 
          b.price, 
          b."createdAt",
          g.id,
          g.name,
          br.total_revenue
        ${orderByClause}
        LIMIT ${pageSize} OFFSET ${skip}
      `),
      this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`
        SELECT COUNT(*) as count FROM "Book" b ${whereClause}
      `),
    ]);

    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      books,
      total,
      totalPages,
      pageNumber,
      pageSize,
    };
  }
  async getBooksByTeacher(teacherId: number) {
    return await this.prisma.book.findMany({
      where: {
        teacherId: teacherId,
      },
      include: {
        grade: true,
        Division: true,
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

  async getBookForUpdate(teacherId: number, bookId: number) {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        teacherId: teacherId,
      },
      select: {
        gradeId: true,
        bookName: true,
        bookFeatures: true,
        price: true,
        thumbnail: true,
        description: true,
        Division: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(
        'الكتاب غير موجود أو ليس لديك صلاحية لتعديله',
      );
    }
    const { Division, ...rest } = book;
    return {
      ...rest,
      divisionIds: Division.map((division) => division.id),
    };
  }

  async getBookById(bookId: number) {
    const book = await this.prisma.book.findUnique({
      where: {
        id: bookId,
      },
      include: {
        grade: true,
        Division: true,
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
