import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ProcessWithdrawRequestDto } from './dto/process-withdraw-request.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post(':id/process')
  processWithdrawRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ProcessWithdrawRequestDto,
    @Req() req,
  ) {
    // return this.adminWithdrawService.processWithdrawRequest(
    //   id,
    //   body,
    //   req.user.id,
    // );
  }
}
