import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType, Status } from '@prisma/client';
import { HandleFiles } from 'src/common/services/handleFiles.service';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { CreateBookDto } from './dto/create-book-dto';
import {
  BookRow,
  BookSortBy,
  GetBooksDto,
  RelatedBook,
} from './dto/get-books.dto';
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
      const teacher = await this.prisma.teacher.findUnique({
        where: {
          id: teacherId,
        },
        select: {
          subjectId: true,
        },
      });
      if (!teacher) {
        throw new NotFoundException('المدرس غير موجود');
      }
      const { divisionIds, ...rest } = body;

      const book = await prisma.book.create({
        data: {
          ...rest,
          subjectId: teacher.subjectId,
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
  async getBooks(getBooksDto: GetBooksDto) {
    const {
      teacherId,
      gradeId,
      divisionId,
      subjectId,
      q,
      minPrice,
      maxPrice,
      sortBy = BookSortBy.RATING,
      sortOrder = SortOrder.DESC,
      pageNumber = 1,
    } = getBooksDto;

    const limit = 10;
    const offset = (pageNumber - 1) * limit;

    const whereConditions: Prisma.Sql[] = [Prisma.sql`1=1`];

    if (gradeId !== undefined)
      whereConditions.push(Prisma.sql`b."gradeId" = ${gradeId}`);
    if (divisionId !== undefined)
      whereConditions.push(
        Prisma.sql`EXISTS (
        SELECT 1 FROM "_BookToDivision" bd 
        WHERE bd."A" = b.id AND bd."B" = ${divisionId}
      )`,
      );
    if (teacherId !== undefined)
      whereConditions.push(Prisma.sql`b."teacherId" = ${teacherId}`);
    if (subjectId !== undefined)
      whereConditions.push(Prisma.sql`t."subjectId" = ${subjectId}`);
    if (q?.trim())
      whereConditions.push(
        Prisma.sql`b."bookName" ILIKE ${'%' + q.trim() + '%'}`,
      );

    if (minPrice !== undefined)
      whereConditions.push(Prisma.sql`b.price >= ${minPrice}`);
    if (maxPrice !== undefined)
      whereConditions.push(Prisma.sql`b.price <= ${maxPrice}`);

    const finalWhereClause = Prisma.sql`WHERE ${Prisma.join(
      whereConditions,
      ' AND ',
    )}`;

    let orderByClause: Prisma.Sql;
    switch (sortBy) {
      case BookSortBy.RATING:
        orderByClause = Prisma.sql`COALESCE(review_stats.avg_rating, 0) ${Prisma.raw(
          sortOrder,
        )}`;
        break;
      case BookSortBy.PRICE:
        orderByClause = Prisma.sql`b.price ${Prisma.raw(sortOrder)}`;
        break;
      case BookSortBy.ORDERS_COUNT:
        orderByClause = Prisma.sql`COALESCE(order_count.order_count, 0) ${Prisma.raw(
          sortOrder,
        )}`;
        break;
      default:
        orderByClause = Prisma.sql`COALESCE(review_stats.avg_rating, 0) ${Prisma.raw(
          sortOrder,
        )}`;
    }
    const finalOrderByClause = Prisma.sql`ORDER BY ${orderByClause}, b.id`;

    const [totalResult, books] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ total_count: bigint }[]>`
    SELECT COUNT(b.id) as "total_count"
    FROM "Book" b
    INNER JOIN "Teacher" t ON b."teacherId" = t.id
    ${finalWhereClause}
  `,

      this.prisma.$queryRaw<BookRow[]>`
    SELECT 
      b.id,
      b.thumbnail,
      b."bookName",
      b.description,
      b."bookFeatures",
      b.price::float as "bookPrice",
      u."displayName" as "teacherName",
      u."profilePicture" as "teacherProfilePicture",
      u."id" as "teacherId",
      g.name as "gradeName",
      s.name as "subjectName",
      COALESCE(review_stats.review_count, 0) as "numberOfReviews",
      COALESCE(review_stats.avg_rating, 0)::float as "avgRating",
      COALESCE(order_count.order_count, 0) as "numberOfOrders"
    FROM "Book" b
    INNER JOIN "Teacher" t ON b."teacherId" = t.id
    INNER JOIN "User" u ON t.id = u.id
    LEFT JOIN "Subject" s ON t."subjectId" = s.id
    INNER JOIN "Grade" g ON b."gradeId" = g.id
    LEFT JOIN (
      SELECT 
        r."bookId",
        COUNT(*)::int as review_count,
        ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
      FROM "Review" r
      WHERE r."productType" = 'BOOK'
      GROUP BY r."bookId"
    ) review_stats ON b.id = review_stats."bookId"
    LEFT JOIN (
      SELECT 
        oi."productId",
        COUNT(*)::int as order_count
      FROM "OrderItem" oi
      WHERE oi."productType" = 'BOOK'
      GROUP BY oi."productId"
    ) order_count ON b.id = order_count."productId"
    ${finalWhereClause}
    ${finalOrderByClause}
    LIMIT ${limit} OFFSET ${offset}
  `,
    ]);

    const total = Number(totalResult[0]?.total_count || 0);
    const totalPages = Math.ceil(total / limit);

    if (pageNumber !== 1 && pageNumber > totalPages) {
      throw new BadRequestException('رقم الصفحة غير صحيح');
    }

    return {
      books,
      total,
      totalPages,
      pageNumber,
      pageSize: limit,
    };
  }
  async getRelatedBooks(id: number) {
    try {
      const currentBook = await this.prisma.book.findUnique({
        where: { id },
        select: { teacherId: true, gradeId: true },
      });

      if (!currentBook) {
        throw new NotFoundException('الكتاب غير موجود');
      }

      const { teacherId, gradeId } = currentBook;

      const relatedBooks = await this.prisma.$queryRaw<RelatedBook[]>`
    WITH same_teacher_books AS (
      SELECT 
        b.id,
        b.thumbnail,
        b."bookName",
        b.description,
        b."bookFeatures",
        b.price::float as "bookPrice",
        u."displayName" as "teacherName",
        u."profilePicture" as "teacherProfilePicture",
        u."id" as "teacherId",
        g.name as "gradeName",
        s.name as "subjectName",
        COALESCE(review_stats.review_count, 0) as "numberOfReviews",
        COALESCE(review_stats.avg_rating, 0)::float as "avgRating",
        COALESCE(order_count.order_count, 0) as "numberOfOrders"
      FROM "Book" b
      INNER JOIN "Teacher" t ON b."teacherId" = t.id
      INNER JOIN "User" u ON t.id = u.id
      LEFT JOIN "Subject" s ON t."subjectId" = s.id
      INNER JOIN "Grade" g ON b."gradeId" = g.id
      LEFT JOIN (
        SELECT 
          r."bookId",
          COUNT(*)::int as review_count,
          ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
        FROM "Review" r
        WHERE r."productType" = 'BOOK'
        GROUP BY r."bookId"
      ) review_stats ON b.id = review_stats."bookId"
      LEFT JOIN (
        SELECT 
          oi."productId",
          COUNT(*)::int as order_count
        FROM "OrderItem" oi
        WHERE oi."productType" = 'BOOK'
        GROUP BY oi."productId"
      ) order_count ON b.id = order_count."productId"
      WHERE b."teacherId" = ${teacherId} AND b.id != ${id}
    ),
    
    same_grade_books AS (
      SELECT 
        b.id,
        b.thumbnail,
        b."bookName",
        b.description,
        b."bookFeatures",
        b.price::float as "bookPrice",
        u."displayName" as "teacherName",
        u."profilePicture" as "teacherProfilePicture",
        u."id" as "teacherId",
        g.name as "gradeName",
        s.name as "subjectName",
        COALESCE(review_stats.review_count, 0) as "numberOfReviews",
        COALESCE(review_stats.avg_rating, 0)::float as "avgRating",
        COALESCE(order_count.order_count, 0) as "numberOfOrders"
      FROM "Book" b
      INNER JOIN "Teacher" t ON b."teacherId" = t.id
      INNER JOIN "User" u ON t.id = u.id
      LEFT JOIN "Subject" s ON t."subjectId" = s.id
      INNER JOIN "Grade" g ON b."gradeId" = g.id
      LEFT JOIN (
        SELECT 
          r."bookId",
          COUNT(*)::int as review_count,
          ROUND(AVG(r.rating::numeric), 2)::float as avg_rating
        FROM "Review" r
        WHERE r."productType" = 'BOOK'
        GROUP BY r."bookId"
      ) review_stats ON b.id = review_stats."bookId"
      LEFT JOIN (
        SELECT 
          oi."productId",
          COUNT(*)::int as order_count
        FROM "OrderItem" oi
        WHERE oi."productType" = 'BOOK'
        GROUP BY oi."productId"
      ) order_count ON b.id = order_count."productId"
      WHERE b."gradeId" = ${gradeId} AND b."teacherId" != ${teacherId} AND b.id != ${id}
    ),
    
    combined_books AS (
      SELECT * FROM same_teacher_books
      UNION ALL
      SELECT * FROM same_grade_books
    )
    
    SELECT 
      id,
      thumbnail,
      "bookName",
      description,
      "bookFeatures",
      "bookPrice",
      "teacherName",
      "teacherProfilePicture",
      "teacherId",
      "gradeName",
      "subjectName",
      "numberOfReviews",
      "avgRating",
      "numberOfOrders"
    FROM combined_books
    ORDER BY RANDOM()
    LIMIT 4
  `;
      return relatedBooks;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
  async getAllBooksIds() {
    const books = await this.prisma.book.findMany({
      select: {
        id: true,
      },
    });
    return books.map((book) => ({
      id: book.id.toString(),
    }));
  }
  async deleteBook(bookId: number, teacherId?: number) {
    return await this.prisma.$transaction(async (prisma) => {
      const whereClause: any = { id: bookId };

      if (teacherId !== undefined) {
        whereClause.teacherId = teacherId;
      }
      const existingBook = await prisma.book.findFirst({
        where: whereClause,
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
    const {
      sortBy,
      sortOrder,
      pageNumber = 1,
      pageSize = 20,
      q,
      minPrice,
      maxPrice,
    } = query;

    const skip = (pageNumber - 1) * pageSize;

    const whereConditions: string[] = [`b."teacherId" = ${teacherId}`];

    if (q) {
      whereConditions.push(`b."bookName" ILIKE '%${q}%'`);
    }

    if (minPrice !== undefined) {
      whereConditions.push(`b.price >= ${minPrice}`);
    }

    if (maxPrice !== undefined) {
      whereConditions.push(`b.price <= ${maxPrice}`);
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

  async getBook(id: number) {
    const book = await this.prisma.$queryRaw<BookRow[]>`
WITH book_base AS (
  SELECT 
    b.id as book_id,
    b.thumbnail,
    b."bookName", 
    b.description, 
    b.price,
    b."bookFeatures",
    b."gradeId",
    t.id as teacher_id,
    u."displayName" as "teacherName",
    u."profilePicture" as "teacherProfilePicture",
    t.bio as "teacherBio",
    s.name as "teacherSubject"
  FROM "Book" b
    INNER JOIN "Teacher" t ON b."teacherId" = t.id
    INNER JOIN "User" u ON t.id = u.id
    LEFT JOIN "Subject" s ON t."subjectId" = s.id
  WHERE b.id = ${id}
),

book_stats AS (
  SELECT 
    ${id} as book_id,
    COALESCE(AVG(r.rating::decimal), 0)::float as book_rating,
    COUNT(DISTINCT oi."orderId")::integer as orders_count
  FROM "Book" b
    LEFT JOIN "Review" r ON b.id = r."bookId"
    LEFT JOIN "OrderItem" oi ON b.id = oi."productId" AND oi."productType" = 'BOOK'
  WHERE b.id = ${id}
),

teacher_stats AS (
  SELECT 
    b."teacherId" as teacher_id,
    COALESCE(AVG(r2.rating::decimal), 0)::float as teacher_rating,
    COUNT(DISTINCT sc."studentId")::integer as teacher_total_students,
    COUNT(DISTINCT c.id)::integer as teacher_total_courses
  FROM "Book" b
    LEFT JOIN "Course" c ON b."teacherId" = c."teacherId"
    LEFT JOIN "Review" r2 ON c.id = r2."courseId"
    LEFT JOIN "StudentCourse" sc ON c.id = sc."courseId"
  WHERE b.id = ${id}
  GROUP BY b."teacherId"
),

book_divisions AS (
  SELECT 
    b.id as book_id,
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'name', d.name
      ) ORDER BY d.name
    ) as divisions
  FROM "Book" b
  INNER JOIN "_BookToDivision" bd ON b.id = bd."A"
  INNER JOIN "Division" d ON bd."B" = d.id
  WHERE b.id = ${id}
  GROUP BY b.id
)

SELECT 
  bb.book_id as "id",
  bb.thumbnail,
  bb."bookName",
  bb.description,
  bb.price,
  bb."bookFeatures",
  jsonb_build_object(
    'id', bb."gradeId",
    'name', g.name
  ) as grade,
  COALESCE(bd.divisions, '[]'::jsonb) as divisions,
  jsonb_build_object(
    'id', bb.teacher_id,
    'teacherName', bb."teacherName",
    'teacherProfilePicture', bb."teacherProfilePicture",
    'teacherBio', bb."teacherBio",
    'teacherSubject', bb."teacherSubject",
    'teacherRating', ts.teacher_rating,
    'teacherTotalStudents', ts.teacher_total_students,
    'teacherTotalCourses', ts.teacher_total_courses
  ) as teacher,
  bs.book_rating as "bookRating",
  bs.orders_count as "ordersCount"
FROM book_base bb
  CROSS JOIN book_stats bs
  LEFT JOIN teacher_stats ts ON bb.book_id = bs.book_id
  INNER JOIN "Grade" g ON bb."gradeId" = g.id
  LEFT JOIN book_divisions bd ON bb.book_id = bd.book_id;
`;

    if (book.length === 0) {
      throw new NotFoundException('الكتاب غير موجود');
    }
    return book[0];
  }
  async getOwnershipStatus(userId: number, bookId: number) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId, teacherId: userId },
    });

    const purchase = await this.prisma.orderItem.findFirst({
      where: {
        productId: bookId,
        productType: ProductType.BOOK,
        order: {
          studentId: userId,
          status: Status.COMPLETED,
        },
      },
      select: {
        id: true,
      },
    });
    return { isOwned: !!purchase || !!book };
  }
}
