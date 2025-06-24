import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';

@Injectable()
export class ImageService {
  async compressImage(
    file: Express.Multer.File,
    resize: { width?: number; height?: number } = {},
    quality: number = 80,
  ): Promise<Express.Multer.File> {
    const buffer = await sharp(file.buffer)
      .resize(resize)
      .jpeg({ quality: quality || 80 })
      .toBuffer();

    return {
      ...file,
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
      originalname: file.originalname.replace(/\.[^.]+$/, '.jpg'),
    };
  }
}
