import { Status } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeOrderStatusDto {
  @IsEnum(Status, {
    message: 'حالة الطلب يجب ان تكون واحدة من (PENDING,CANCELLED,COMPLETED)',
  })
  status: Status;
}
