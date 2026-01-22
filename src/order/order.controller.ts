import {
  Body,
  Controller,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductType, Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CreateOrderDto } from './dto/address-dto';
import { OrderService } from './order.service';

@ApiTags('order')
@ApiBearerAuth('accessToken')
@Controller('order')
@Roles(Role.STUDENT)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('create-cart-order')
  createCartOrder(@Req() req, @Body() body: CreateOrderDto) {
    return this.orderService.createCartOrder(
      req.user.id,
      body.paymentSource,
      body.addressId,
      body.newAddress,
    );
  }
  @Post('create-direct-order/:productId/:productType')
  createDirectOrder(
    @Req() req,
    @Body() body: CreateOrderDto,
    @Param('productId', ParseIntPipe) productId: number,
    @Param('productType', new ParseEnumPipe(ProductType))
    productType: ProductType,
  ) {
    return this.orderService.createDirectOrder(
      req.user.id,
      productId,
      productType,
      body.paymentSource,
      body.addressId,
      body.newAddress,
    );
  }
}
