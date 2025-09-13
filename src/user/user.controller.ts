import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('users')
export class UserController {
  constructor(private readonly usersService: UserService) {}
  @Roles('STUDENT')
  @Get('me')
  get() {
    return {
      hi: 'delete this',
    };
  }
}
