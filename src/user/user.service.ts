import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}
  async findUserById(id: number) {
    return await this.prisma.user.findUnique({
      where: {
        id,
      },
    });
  }
  async findUserByUsername(userName: string) {
    return await this.prisma.user.findUnique({
      where: {
        userName,
      },
    });
  }
  async updateHashedRefreshToken(userId: number, hashedRt: string | null) {
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshToken: hashedRt,
      },
    });
  }
}
