import {
  BadRequestException,
  Body,
  Controller,
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
import { PaymentSource, Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CreateOrderDto } from 'src/order/dto/address-dto';
import { ImageValidationPipe } from 'src/pipes/file-validation.pipe';
import { GetStudentStatisticsDto } from 'src/student/dto/get-student-statistics.dto';
import { RechargeBalanceDto } from 'src/student/dto/reacharge-balance.dto';
import { ChooseStudentsDto } from './dto/choose-students.dto';
import { UpdateGuardianProfileDto } from './dto/update-guardian-profile.dto';
import { GuardianService } from './guardian.service';

@Controller('guardian')
@Roles(Role.GUARDIAN)
export class GuardianController {
  constructor(private readonly guardianService: GuardianService) {}

  @Get('/students')
  getStudents(@Req() req) {
    return this.guardianService.getStudents(req.user.id);
  }
  @Get('student/:studentId/statistics')
  getStudentStatistics(
    @Req() req,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: GetStudentStatisticsDto,
  ) {
    return this.guardianService.getStudentStatistics(
      req.user.id,
      studentId,
      query.startDate,
      query.endDate,
    );
  }
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
  @Get('/student/:studentId/addresses')
  getStudentAddresses(
    @Req() req,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.guardianService.getStudentAddresses(req.user.id, studentId);
  }

  @Put('update-profile')
  @UseInterceptors(FileInterceptor('profilePicture'))
  updateProfile(
    @Req() req,
    @Body() body: UpdateGuardianProfileDto,
    @UploadedFile(
      new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.guardianService.updateProfile(req.user.id, body, file);
  }

  @Get('info-for-update')
  guardianInfoForUpdate(@Req() req) {
    return this.guardianService.getGuardianProfileForUpdate(req.user.id);
  }
}
