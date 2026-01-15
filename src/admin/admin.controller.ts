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
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetAllUsersDto } from '../user/dto/get-all-users.dto';
import { AdminService } from './admin.service';
import { GetDashboardStatisticsDto } from './dto/get-dashboard-statistics.dto';
import { ProcessWithdrawRequestDto } from './dto/process-withdraw-request.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard-stats')
  getDashboardStatistics(@Query() query: GetDashboardStatisticsDto) {
    const endDate = query.endDate || new Date();
    const startDate =
      query.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.adminService.getDashboardStatistics(startDate, endDate);
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
