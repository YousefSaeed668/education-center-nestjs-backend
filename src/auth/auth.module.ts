import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserService } from 'src/user/user.service';
import { LocalStrategy } from './strategies/local-strategy';
import { JwtModule, JwtService } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { JwtStrategy } from './strategies/jwt-strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ConfigModule } from '@nestjs/config';
import refreshConfig from './config/refresh.token';
import { RefreshStrategy } from './strategies/refresh-token.strategy';
import { UserModule } from 'src/user/user.module';
import { PrismaService } from 'src/prisma.service';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(refreshConfig),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    LocalAuthGuard,
    RefreshStrategy,
    PrismaService,
    JwtService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AuthModule {}
