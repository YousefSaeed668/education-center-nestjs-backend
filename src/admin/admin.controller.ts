import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ProcessWithdrawRequestDto } from './dto/process-withdraw-request.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { GetAllUsersDto } from '../user/dto/get-all-users.dto';
import { GetFinancialStatisticsDto } from './dto/get-financial-statistics.dto';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('financial-statistics')
  getFinancialStatistics(@Query() query: GetFinancialStatisticsDto) {
    return this.adminService.getFinancialStatistics(
      query.startDate,
      query.endDate,
    );
  }

  @Patch('/withdraw-requests/:id/approve')
  processWithdrawRequest(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() processDto: ProcessWithdrawRequestDto,
  ) {
    return this.adminService.processWithdrawal(req.user.id, id, processDto);
  }

  @Post('platform/settings')
  updatePlatformSettings(
    @Req() req,
    @Body() settings: UpdatePlatformSettingsDto,
  ) {
    return this.adminService.updatePlatformSettings(req.user.id, settings);
  }

  @Get('get-all-users')
  getAllUsers(@Query() query: GetAllUsersDto) {
    return this.adminService.getAllUsers(query);
  }
}
