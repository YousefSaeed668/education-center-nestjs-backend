import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Req,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { GuardianService } from './guardian.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { PaymentSource, Role } from '@prisma/client';
import { ChooseStudentsDto } from './dto/choose-students.dto';
import { CreateOrderDto } from 'src/order/dto/address-dto';
import { RechargeBalanceDto } from 'src/student/dto/reacharge-balance.dto';

@Controller('guardian')
@Roles(Role.GUARDIAN)
export class GuardianController {
  constructor(private readonly guardianService: GuardianService) {}

  @Get('/students-with-parent-number')
  getStudentsWithParentNumber(@Req() req) {
    return this.guardianService.getStudentsWithParentNumber(req.user.id);
  }

  @Post('/choose-students')
  chooseStudent(@Req() req, @Body() body: ChooseStudentsDto) {
    return this.guardianService.chooseStudent(req.user.id, body);
  }

  @Get('/student/cart/:studentId')
  getStudentCart(
    @Req() req,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.guardianService.getStudentCart(req.user.id, studentId);
  }
  @Post('/student/:studentId/create-cart-order')
  createStudentCartOrder(
    @Req() req,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() body: CreateOrderDto,
  ) {
    if (body.paymentSource !== PaymentSource.CREDIT_CARD) {
      throw new BadRequestException(
        'الأوصياء يمكنهم الدفع بالبطاقة الائتمانية فقط',
      );
    }
    return this.guardianService.createStudentCartOrder(
      req.user.id,
      studentId,
      body.addressId,
      body.newAddress,
    );
  }

  @Post('recharge-student-balance/:studentId')
  rechargeStudentBalance(
    @Req() req,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() body: RechargeBalanceDto,
  ) {
    return this.guardianService.rechargeStudentBalance(
      req.user.id,
      studentId,
      body.amount,
    );
  }
}
