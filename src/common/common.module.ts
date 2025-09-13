import { Module } from '@nestjs/common';

import { ImageService } from './services/image.service';
import { HandleFiles } from './services/handleFiles.service';
import { ResponseInterceptor } from './interceptors/response.interceptor';

@Module({
  providers: [HandleFiles, ImageService, ResponseInterceptor],
  exports: [ImageService, HandleFiles, ResponseInterceptor],
})
export class CommonModule {}
