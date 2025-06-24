import { Module } from '@nestjs/common';

import { ImageService } from './services/image.service';
import { HandleFiles } from './services/handleFiles.service';

@Module({
  providers: [HandleFiles, ImageService],
  exports: [ImageService, HandleFiles],
})
export class CommonModule {}
