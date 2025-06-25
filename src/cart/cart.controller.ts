import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CartService } from './cart.service';
import { CartParamsDto, UpdateQuantityDto } from './dto/cart-param.dto';

@Controller('cart')
@Roles(Role.STUDENT)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add/:itemId/:productType')
  addToCart(@Param() param: CartParamsDto, @Req() req) {
    return this.cartService.addToCart(
      req.user.id,
      param.itemId,
      param.productType,
    );
  }

  @Delete('remove/:itemId/:productType')
  removeFromCart(@Param() param: CartParamsDto, @Req() req) {
    return this.cartService.removeFromCart(
      req.user.id,
      param.itemId,
      param.productType,
    );
  }

  @Put('update-quantity/:itemId/:productType')
  updateQuantity(
    @Param() param: CartParamsDto,
    @Body() body: UpdateQuantityDto,
    @Req() req,
  ) {
    return this.cartService.updateQuantity(
      req.user.id,
      param.itemId,
      param.productType,
      body.quantity,
    );
  }
}
