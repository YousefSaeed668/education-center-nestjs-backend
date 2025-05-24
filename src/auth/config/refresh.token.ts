import { registerAs } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';

export default registerAs(
  'refresh-jwt',
  (): JwtModuleOptions => ({
    secret: process.env.REFRESH_JWT_SECRET,
    signOptions: {
      expiresIn: process.env.REFRESH_JWT_EXPIREST_IN,
    },
  }),
);
