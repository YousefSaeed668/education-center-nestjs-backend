import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PaymentSource, ProductType } from '@prisma/client';
import { CartService } from 'src/cart/cart.service';
import { PaymentPurpose } from 'src/paymob/IPaymob';
import { PaymobService } from 'src/paymob/paymob.service';
import { PrismaService } from 'src/prisma.service';
import { AddressDto } from './dto/address-dto';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly paymobService: PaymobService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async validateAndSetAddress(
    studentId: number,
    needsAddress: boolean,
    addressId?: number,
    newAddress?: AddressDto,
  ): Promise<number | null> {
    if (!needsAddress) {
      return null;
    }

    if (!addressId && !newAddress) {
      throw new BadRequestException('يجب تحديد عنوان التوصيل عند طلب كتب');
    }

    if (addressId && newAddress) {
      throw new BadRequestException(
        'لا يمكن إرسال عنوان موجود وعنوان جديد في نفس الوقت',
      );
    }

    if (addressId) {
      const address = await this.prisma.address.findFirst({
        where: {
          id: addressId,
          studentId: studentId,
        },
      });

      if (!address) {
        throw new NotFoundException('العنوان غير موجود أو لا ينتمي للطالب');
      }
      return addressId;
    }

    if (newAddress) {
      try {
        const city = await this.prisma.city.findFirst({
          where: {
            id: newAddress.cityId,
            governmentId: newAddress.governmentId,
          },
        });

        if (!city) {
          throw new BadRequestException('المدينة والمحافظة غير متطابقتين');
        }

        const createdAddress = await this.prisma.address.create({
          data: {
            recipientName: newAddress.recipientName,
            phoneNumber: newAddress.phoneNumber,
            streetAddress: newAddress.streetAddress,
            postalCode: newAddress.postalCode,
            additionalNotes: newAddress.additionalNotes,
            isDefault: newAddress.isDefault || false,
            governmentId: newAddress.governmentId,
            cityId: newAddress.cityId,
            studentId: studentId,
          },
        });

        return createdAddress.id;
      } catch (error) {
        console.error('Error creating new address:', error);
        throw new BadRequestException(error);
      }
    }

    return null;
  }

  async createCartOrder(
    studentId: number,
    paymentSource: PaymentSource,
    addressId?: number,
    newAddress?: AddressDto,
  ) {
    const cart = await this.cartService.getCart(studentId);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        user: {
          select: {
            displayName: true,
            phoneNumber: true,
            balance: true,
          },
        },
      },
    });

    if (!cart || cart.cartItems.length === 0) {
      throw new BadRequestException('عربة التسوق فارغة');
    }
    if (!student) {
      throw new NotFoundException('الطالب غير موجود');
    }

    const hasBooks = cart.cartItems.some((item) => item.productType === 'BOOK');
    const finalAddressId = await this.validateAndSetAddress(
      studentId,
      hasBooks,
      addressId,
      newAddress,
    );

    if (paymentSource === PaymentSource.BALANCE) {
      const totalPrice = cart.totalPrice;
      const userBalance = student.user.balance.toNumber();

      if (userBalance < totalPrice) {
        throw new BadRequestException('رصيد الطالب غير كافٍ');
      }

      await this.processBalanceCartPayment(studentId, cart, finalAddressId);

      return {
        success: true,
        message: 'تم الدفع بالرصيد بنجاح',
        data: {
          paymentMethod: 'balance',
          totalAmount: totalPrice,
        },
      };
    }

    const user = {
      phone: student.user.phoneNumber,
      firstName: student.user.displayName,
      lastName: student.user.displayName,
    };

    const url = await this.paymobService.getPaymentKey(
      user,
      cart.totalPrice,
      cart.cartItems,
      {
        purpose: PaymentPurpose.CART_ORDER,
        studentId: student.id,
        metadata: {
          cartId: cart.id,
          addressId: finalAddressId,
          paymentSource: paymentSource,
        },
      },
    );

    return url;
  }

  private async processBalanceCartPayment(
    studentId: number,
    cart: any,
    addressId: number | null,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.findUnique({
          where: { id: studentId },
          select: {
            user: {
              select: {
                balance: true,
              },
            },
          },
        });

        const totalPrice = cart.totalPrice;
        const userBalance = student?.user.balance.toNumber() || 0;

        if (userBalance < totalPrice) {
          throw new BadRequestException('رصيد الطالب غير كافٍ');
        }

        await tx.user.update({
          where: { id: studentId },
          data: {
            balance: {
              decrement: totalPrice,
            },
          },
        });
      });

      const payload = {
        orderId: 0,
        transactionId: Date.now(),
        amountCents: cart.totalPrice * 100,
        studentId: studentId,
        metadata: {
          cartId: cart.id,
          addressId: addressId,
          paymentSource: PaymentSource.BALANCE,
        },
      };

      this.eventEmitter.emit('payment.cart-order.success', payload);
    } catch (error) {
      console.error('Error processing balance cart payment:', error);
      throw error;
    }
  }

  @OnEvent('payment.cart-order.success')
  async handleCartOrderSuccess(payload: {
    orderId: number;
    transactionId: number;
    amountCents: number;
    studentId: number;
    metadata: {
      cartId: number;
      addressId?: number;
      paymentSource: PaymentSource;
    };
  }) {
    console.log(
      `OrderService: Updating order ${payload.orderId} to paid status.`,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { id: payload.metadata.cartId },
          include: {
            cartItems: {
              include: {
                course: true,
                book: true,
              },
            },
          },
        });

        if (!cart) {
          throw new NotFoundException(' عربة التسوق غير موجودة');
        }

        const order = await tx.order.create({
          data: {
            studentId: payload.studentId,
            totalAmount: payload.amountCents / 100,
            status: 'COMPLETED',
            transactionId: payload.transactionId.toString(),
            shippingAddressId: payload.metadata.addressId || null,
          },
        });

        for (const cartItem of cart.cartItems) {
          const itemPrice =
            cartItem.productType === 'COURSE'
              ? cartItem.course?.price.toNumber() || 0
              : cartItem.book?.price.toNumber() || 0;

          const orderItem = await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: cartItem.productId,
              productType: cartItem.productType,
              price: itemPrice,
              quantity: cartItem.quantity,
            },
          });

          const platformSetting = await tx.platformSetting.findFirst({
            select: {
              platformPercentage: true,
            },
          });
          if (!platformSetting) {
            throw new NotFoundException('إعدادات المنصة غير موجودة');
          }
          const totalItemAmount = itemPrice * cartItem.quantity;
          const teacherShare =
            totalItemAmount *
            (1 - platformSetting?.platformPercentage.toNumber());
          const adminShare =
            totalItemAmount * platformSetting?.platformPercentage.toNumber();

          let teacherId: number;
          if (cartItem.productType === 'COURSE') {
            teacherId = cartItem.course?.teacherId || 0;
          } else {
            teacherId = cartItem.book?.teacherId || 0;
          }

          if (teacherId) {
            await tx.user.update({
              where: { id: teacherId },
              data: {
                balance: {
                  increment: teacherShare,
                },
              },
            });

            await tx.transaction.create({
              data: {
                orderItemId: orderItem.id,
                teacherId: teacherId,
                teacherShare: teacherShare,
                totalAmount: totalItemAmount,
                adminShare: adminShare,
                transactionType: 'ORDER',
                description: `بيع ${cartItem.productType === 'COURSE' ? 'كورس' : 'كتاب'}: ${cartItem.productType === 'COURSE' ? cartItem.course?.courseName : cartItem.book?.bookName}`,
                paymentSource: payload.metadata.paymentSource,
              },
            });
          }

          if (cartItem.productType === 'COURSE') {
            const existingStudentCourse = await tx.studentCourse.findUnique({
              where: {
                studentId_courseId: {
                  studentId: payload.studentId,
                  courseId: cartItem.productId,
                },
              },
            });

            if (!existingStudentCourse) {
              const course = await tx.course.findUnique({
                where: { id: cartItem.productId },
                select: { expiresAt: true },
              });

              await tx.studentCourse.create({
                data: {
                  studentId: payload.studentId,
                  courseId: cartItem.productId,
                  expiresAt: course?.expiresAt,
                  isActive: true,
                },
              });
            }
          }
        }

        await tx.cartItem.deleteMany({
          where: { cartId: payload.metadata.cartId },
        });
      });
    } catch (error) {
      console.error('Error handling cart order success:', error);
      throw error;
    }
  }

  async createDirectOrder(
    studentId: number,
    productId: number,
    productType: ProductType,
    paymentSource: PaymentSource,
    addressId?: number,
    newAddress?: AddressDto,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        user: {
          select: {
            displayName: true,
            phoneNumber: true,
            balance: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('الطالب غير موجود');
    }

    let product: any;
    let price: number;

    if (productType === 'COURSE') {
      product = await this.prisma.course.findUnique({
        where: { id: productId },
        select: { id: true, courseName: true, price: true, expiresAt: true },
      });

      if (!product) {
        throw new NotFoundException('الكورس غير موجود');
      }

      const existingStudentCourse = await this.prisma.studentCourse.findUnique({
        where: {
          studentId_courseId: {
            studentId: studentId,
            courseId: productId,
          },
        },
      });

      if (existingStudentCourse) {
        throw new BadRequestException('الطالب يملك هذا الكورس بالفعل');
      }

      price = product.price.toNumber();
    } else if (productType === 'BOOK') {
      product = await this.prisma.book.findUnique({
        where: { id: productId },
        select: { id: true, bookName: true, price: true },
      });

      if (!product) {
        throw new NotFoundException('الكتاب غير موجود');
      }

      price = product.price.toNumber();
    } else {
      throw new BadRequestException('نوع المنتج غير صالح');
    }

    let finalAddressId: number | null = null;

    if (productType === 'BOOK') {
      finalAddressId = await this.validateAndSetAddress(
        studentId,
        true,
        addressId,
        newAddress,
      );
    }

    if (paymentSource === PaymentSource.BALANCE) {
      const userBalance = student.user.balance.toNumber();

      if (userBalance < price) {
        throw new BadRequestException('رصيد الطالب غير كافٍ');
      }

      await this.processBalanceDirectPayment(
        studentId,
        productId,
        productType,
        price,
        finalAddressId,
      );

      return {
        paymentMethod: 'balance',
        totalAmount: price,
      };
    }
    const paymentItem = {
      name: productType === 'BOOK' ? product.bookName : product.courseName,
      amount_cents: price * 100,
      description: `${productType} - ${productType === 'BOOK' ? product.bookName : product.courseName}`,
      quantity: 1,
    };
    const user = {
      phone: student.user.phoneNumber,
      firstName: student.user.displayName,
      lastName: student.user.displayName,
    };

    const url = await this.paymobService.getPaymentKey(
      user,
      price,
      [paymentItem],
      {
        purpose: PaymentPurpose.DIRECT_PURCHASE,
        studentId: student.id,
        metadata: {
          productId: productId,
          productType: productType,
          addressId: finalAddressId,
          paymentSource: paymentSource,
        },
      },
    );
    return url;
  }

  private async processBalanceDirectPayment(
    studentId: number,
    productId: number,
    productType: ProductType,
    price: number,
    addressId: number | null,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.findUnique({
          where: { id: studentId },
          select: {
            user: {
              select: {
                balance: true,
              },
            },
          },
        });

        const userBalance = student?.user.balance.toNumber() || 0;

        if (userBalance < price) {
          throw new BadRequestException('رصيد الطالب غير كافٍ');
        }

        await tx.user.update({
          where: { id: studentId },
          data: {
            balance: {
              decrement: price,
            },
          },
        });
      });

      const payload = {
        orderId: 0,
        transactionId: Date.now(),
        amountCents: price * 100,
        studentId: studentId,
        metadata: {
          productId: productId,
          productType: productType,
          addressId: addressId,
          paymentSource: PaymentSource.BALANCE,
        },
      };

      this.eventEmitter.emit('payment.direct-purchase.success', payload);
    } catch (error) {
      console.error('Error processing balance direct payment:', error);
      throw error;
    }
  }

  @OnEvent('payment.direct-purchase.success')
  async handleDirectOrderSuccess(payload: {
    orderId: number;
    transactionId: number;
    amountCents: number;
    studentId: number;
    metadata: {
      productId: number;
      productType: ProductType;
      addressId?: number;
      paymentSource: PaymentSource;
    };
  }) {
    console.log(
      `OrderService: Creating direct order for product ${payload.metadata.productId} of type ${payload.metadata.productType}`,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            studentId: payload.studentId,
            totalAmount: payload.amountCents / 100,
            status: 'COMPLETED',
            transactionId: payload.transactionId.toString(),
            shippingAddressId: payload.metadata.addressId || null,
          },
        });

        let productPrice: number = 0;
        let teacherId: number = 0;
        let productName: string = '';

        if (payload.metadata.productType === 'COURSE') {
          const course = await tx.course.findUnique({
            where: { id: payload.metadata.productId },
            select: {
              price: true,
              expiresAt: true,
              teacherId: true,
              courseName: true,
            },
          });

          if (!course) {
            throw new NotFoundException('الكورس غير موجود');
          }

          productPrice = course.price.toNumber();
          teacherId = course.teacherId;
          productName = course.courseName;

          await tx.studentCourse.create({
            data: {
              studentId: payload.studentId,
              courseId: payload.metadata.productId,
              expiresAt: course.expiresAt,
              isActive: true,
            },
          });
        } else if (payload.metadata.productType === 'BOOK') {
          const book = await tx.book.findUnique({
            where: { id: payload.metadata.productId },
            select: { price: true, teacherId: true, bookName: true },
          });

          if (!book) {
            throw new NotFoundException('الكتاب غير موجود');
          }

          productPrice = book.price.toNumber();
          teacherId = book.teacherId;
          productName = book.bookName;
        }

        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: payload.metadata.productId,
            productType: payload.metadata.productType,
            price: productPrice,
            quantity: 1,
          },
        });

        const platformSetting = await tx.platformSetting.findFirst({
          select: {
            platformPercentage: true,
          },
        });

        if (!platformSetting) {
          throw new NotFoundException('إعدادات المنصة غير موجودة');
        }
        const teacherShare =
          productPrice * (1 - platformSetting.platformPercentage.toNumber());
        const adminShare =
          productPrice * platformSetting.platformPercentage.toNumber();

        if (teacherId) {
          await tx.user.update({
            where: { id: teacherId },
            data: {
              balance: {
                increment: teacherShare,
              },
            },
          });

          await tx.transaction.create({
            data: {
              orderItemId: orderItem.id,
              teacherId: teacherId,
              teacherShare: teacherShare,
              totalAmount: productPrice,
              adminShare: adminShare,
              transactionType: 'ORDER',
              description: `بيع ${payload.metadata.productType === 'COURSE' ? 'كورس' : 'كتاب'}: ${productName}`,
              paymentSource: payload.metadata.paymentSource,
            },
          });

          console.log(
            `Added ${teacherShare} EGP commission to teacher ${teacherId} for direct purchase of ${payload.metadata.productType} ${payload.metadata.productId}`,
          );
        }

        console.log(`Direct order ${order.id} created successfully`);
      });
    } catch (error) {
      console.error('Error handling direct order success:', error);
      throw error;
    }
  }
}
