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

  async addToCart(studentId: number, itemId: number, productType: ProductType) {
    return this.prisma.$transaction(async (tx) => {
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

      if (
        productType === ProductType.COURSE ||
        productType === ProductType.EBOOK
      ) {
        const existingItem = await tx.cartItem.findFirst({
          where: {
            cartId: cart.id,
            productId: itemId,
            productType: productType,
          },
        });

        if (existingItem) {
          throw new ConflictException(
            `${productType === ProductType.COURSE ? 'الكورس' : 'الكتاب الاكترونى'} موجود بالفعل فى عربة التسوق`,
          );
        }

        const newItem = await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: itemId,
            productType: productType,
            quantity: 1,
          },
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

        const newItem = await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: itemId,
            productType: ProductType.BOOK,
            quantity: 1,
          },
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
      message: `تم حذف ${productType === ProductType.COURSE ? 'الكورس' : productType === ProductType.EBOOK ? 'الكتاب الالكتروني' : 'الكتاب'} من عربة التسوق بنجاح`,
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
}
