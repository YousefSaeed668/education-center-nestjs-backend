import { Module } from '@nestjs/common';
import { LookupService } from './lookup.service';
import { LookupController } from './lookup.controller';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [LookupController],
  providers: [LookupService, PrismaService],
})
export class LookupModule {}
