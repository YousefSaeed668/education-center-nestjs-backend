import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { S3Service } from './s3.service';

@ApiTags('s3')
@Controller()
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}
}
