import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Role, WithdrawUserType } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CreateWithdrawRequestDto } from './dto/create-withdraw-request.dto';
import { GetWithdrawRequestsDto } from './dto/get-withdrawal-requests.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Roles(Role.TEACHER, Role.STUDENT)
  @Post('withdrawal-request')
  withdrawalRequest(@Req() req, @Body() body: CreateWithdrawRequestDto) {
    const userRole = req.user.role;
    let userType: WithdrawUserType;
    if (userRole === Role.TEACHER) {
      userType = WithdrawUserType.TEACHER;
    } else {
      userType = WithdrawUserType.STUDENT;
    }
    return this.userService.createWithdrawRequest(req.user.id, userType, body);
  }

  @Roles(Role.TEACHER, Role.STUDENT)
  @Get('get-withdraw-requests')
  getWithdrawRequests(@Req() req, @Query() query: GetWithdrawRequestsDto) {
    return this.userService.getWithdrawRequests(req.user.id, query);
  }
}
