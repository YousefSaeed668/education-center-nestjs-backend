import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(studentId: number, guardianId?: number) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        studentId,
      },
      include: {
        student: {
          select: {
            guardianId: true,
          },
        },
        cartItems: {
          include: {
            course: {
              select: {
                price: true,
                courseName: true,
              },
            },
            book: {
              select: {
                price: true,
                bookName: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException('عربة التسوق فارغة');
    }

    if (guardianId && cart.student.guardianId !== guardianId) {
      throw new NotFoundException('لا يمكن الوصول إلى عربة التسوق لهذا الطالب');
    }
    let totalPrice = 0;
    const orderedData = cart.cartItems.map((cartItem) => {
      let price: number;
      let itemName: string;

      if (cartItem.productType === ProductType.COURSE) {
        if (!cartItem.course) {
          throw new NotFoundException(
            `الكورس غير موجود فى عربية التسوق${cartItem.id}`,
          );
        }
        price = cartItem.course.price.toNumber();
        itemName = cartItem.course.courseName;
      } else if (cartItem.productType === ProductType.BOOK) {
        if (!cartItem.book) {
          throw new NotFoundException(
            `الكتاب غير موجود فى عربية التسوق ${cartItem.id}`,
          );
        }
        price = cartItem.book.price.toNumber();
        itemName = cartItem.book.bookName;
      } else {
        throw new BadRequestException('Invalid product type');
      }

      totalPrice += price * cartItem.quantity;

      return {
        id: cartItem.id,
        cartId: cartItem.cartId,
        productId: cartItem.productId,
        productType: cartItem.productType,
        quantity: cartItem.quantity,
        itemName: itemName,
        price: price,
        subtotal: price * cartItem.quantity,
      };
    });

    return {
      id: cart.id,
      studentId: cart.studentId,
      cartItems: orderedData,
      totalPrice: totalPrice,
    };
  }
  async addToCart(studentId: number, itemId: number, productType: ProductType) {
    return this.prisma.$transaction(async (tx) => {
      if (productType === ProductType.COURSE) {
        const courseExists = await tx.course.findUnique({
          where: { id: itemId },
        });
        if (!courseExists) {
          throw new NotFoundException('الكورس غير موجود');
        }
        const isStudentCourse = await tx.studentCourse.findFirst({
          where: {
            studentId: studentId,
            courseId: itemId,
          },
        });
        if (isStudentCourse) {
          throw new ConflictException('الكورس موجود بالفعل فى مكتبة الطالب');
        }
      } else if (productType === ProductType.BOOK) {
        const bookExists = await tx.book.findUnique({
          where: { id: itemId },
        });
        if (!bookExists) {
          throw new NotFoundException('الكتاب غير موجود');
        }
      }

      let cart = await tx.cart.findUnique({
        where: {
          studentId: studentId,
        },
      });

      if (!cart) {
        cart = await tx.cart.create({
          data: {
            studentId: studentId,
          },
        });
      }

      if (productType === ProductType.COURSE) {
        const existingItem = await tx.cartItem.findFirst({
          where: {
            cartId: cart.id,
            productId: itemId,
            productType,
          },
        });

        if (existingItem) {
          throw new ConflictException(
            `${productType === ProductType.COURSE ? 'الكورس' : 'الكتاب الاكترونى'} موجود بالفعل فى عربة التسوق`,
          );
        }

        const cartItemData: any = {
          cartId: cart.id,
          productId: itemId,
          productType,
          quantity: 1,
        };
        const data = {
          ...cartItemData,
        };

        if (productType === ProductType.COURSE) {
          data.courseId = itemId;
        }
        const newItem = await tx.cartItem.create({
          data,
        });

        return {
          success: true,
          message: `تم إضافة ${productType === ProductType.COURSE ? 'الكورس' : 'الكتاب الالكتروني'} إلى عربة التسوق بنجاح`,
          data: newItem,
        };
      }

      if (productType === ProductType.BOOK) {
        const existingItem = await tx.cartItem.findFirst({
          where: {
            cartId: cart.id,
            productId: itemId,
            productType: ProductType.BOOK,
          },
        });

        if (existingItem) {
          if (existingItem.quantity >= 99) {
            throw new BadRequestException(
              'لا يمكن إضافة أكثر من 99 نسخة من الكتاب',
            );
          }
          const updatedItem = await tx.cartItem.update({
            where: {
              id: existingItem.id,
            },
            data: {
              quantity: existingItem.quantity + 1,
            },
          });

          return {
            success: true,
            message: 'تم زيادة كمية الكتاب في عربة التسوق بنجاح',
            data: updatedItem,
          };
        }

        const cartItemData: any = {
          cartId: cart.id,
          bookId: itemId,
          productId: itemId,
          productType: ProductType.BOOK,
          quantity: 1,
        };

        const newItem = await tx.cartItem.create({
          data: cartItemData,
        });

        return {
          success: true,
          message: 'تم إضافة الكتاب إلى عربة التسوق بنجاح',
          data: newItem,
        };
      }
    });
  }

  async removeFromCart(
    studentId: number,
    itemId: number,
    productType: ProductType,
  ) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        studentId: studentId,
      },
    });

    if (!cart) {
      throw new NotFoundException('اضف منتج الى عربة التسوق اولا');
    }

    const result = await this.prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        productId: itemId,
        productType: productType,
      },
    });

    return {
      success: true,
      message: `تم حذف ${productType === ProductType.COURSE ? 'الكورس' : 'الكتاب'} من عربة التسوق بنجاح`,
      deletedCount: result.count,
    };
  }

  async updateQuantity(
    studentId: number,
    itemId: number,
    productType: ProductType,
    quantity: number,
  ) {
    if (productType !== ProductType.BOOK) {
      throw new BadRequestException('يمكن تحديث الكمية فقط للكتب');
    }

    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: {
          studentId: studentId,
        },
      });

      if (!cart) {
        throw new NotFoundException('اضف منتج الى عربة التسوق اولا');
      }

      const existingItem = await tx.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: itemId,
          productType: ProductType.BOOK,
        },
      });

      if (!existingItem) {
        throw new NotFoundException('هذا الكتاب غير موجود في عربة التسوق');
      }

      if (quantity === 0) {
        await tx.cartItem.delete({
          where: {
            id: existingItem.id,
          },
        });

        return {
          success: true,
          message: 'تم حذف الكتاب من عربة التسوق بنجاح',
          data: null,
        };
      }

      const updatedItem = await tx.cartItem.update({
        where: {
          id: existingItem.id,
        },
        data: {
          quantity: quantity,
        },
      });

      return {
        success: true,
        message: 'تم تحديث كمية الكتاب في عربة التسوق بنجاح',
        data: updatedItem,
      };
    });
  }

  async clearCart(studentId: number) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        studentId: studentId,
      },
    });

    if (!cart) {
      throw new NotFoundException('عربة التسوق فارغة');
    }

    await this.prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
      },
    });

    return {
      success: true,
      message: 'تم تفريغ عربة التسوق بنجاح',
    };
  }
}
