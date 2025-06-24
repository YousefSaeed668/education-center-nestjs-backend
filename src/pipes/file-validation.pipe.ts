import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import * as sharp from 'sharp';

@Injectable()
export class LectureFilesValidationPipe implements PipeTransform {
  transform(files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('مطلوب ملف واحد على الأقل');
    }

    const allowedFileTypes = [
      /^video\/(mp4|mpeg|quicktime|x-msvideo|webm)$/,
      /^application\/pdf$/,
      /^application\/msword$/,
      /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
      /^application\/vnd\.ms-excel$/,
      /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/,
    ];

    const maxFileSize = 100 * 1024 * 1024;

    for (const file of files) {
      const isAllowedType = allowedFileTypes.some((pattern) =>
        pattern.test(file.mimetype),
      );

      if (!isAllowedType) {
        throw new BadRequestException(
          'يجب أن تكون الملفات من نوع PDF أو مستندات Word أو ملف Excel أو ملفات فيديو',
        );
      }

      if (file.size > maxFileSize) {
        throw new BadRequestException(
          `حجم الملف "${file.originalname}" يجب ألا يتجاوز 100 ميجابايت`,
        );
      }
    }

    return files;
  }
}

@Injectable()
export class LectureUploadValidationPipe implements PipeTransform {
  async transform(uploadedFiles: {
    files?: Express.Multer.File[];
    thumbnail?: Express.Multer.File[];
  }) {
    if (!uploadedFiles) {
      return { files: [], thumbnail: undefined };
    }

    let validatedFiles: Express.Multer.File[] = [];
    if (uploadedFiles.files && uploadedFiles.files.length > 0) {
      validatedFiles = new LectureFilesValidationPipe().transform(
        uploadedFiles.files,
      );
    }

    let validatedThumbnail: Express.Multer.File | undefined = undefined;
    if (uploadedFiles.thumbnail && uploadedFiles.thumbnail.length > 0) {
      const imageValidationPipe = new ImageValidationPipe({
        isRequired: false,
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        typeErrorMessage:
          'يجب أن تكون الصورة المصغرة ملف صورة (JPEG أو PNG أو WebP)',
        sizeErrorMessage: 'حجم الصورة المصغرة يجب ألا يتجاوز 5 ميجابايت',
      });

      validatedThumbnail = await imageValidationPipe.transform(
        uploadedFiles.thumbnail[0],
      );
    }

    return {
      files: validatedFiles,
      thumbnail: validatedThumbnail,
    };
  }
}

@Injectable()
export class ImageValidationPipe implements PipeTransform {
  private readonly options: {
    isRequired: boolean;
    maxSize: number;
    allowedTypes: string[];
    typeErrorMessage: string;
    sizeErrorMessage: string;
  };

  constructor(
    options: {
      isRequired?: boolean;
      maxSize?: number;
      allowedTypes?: string[];
      typeErrorMessage?: string;
      sizeErrorMessage?: string;
    } = {},
  ) {
    const maxSize = options.maxSize || 5 * 1024 * 1024;
    this.options = {
      isRequired: options.isRequired || false,
      maxSize,
      allowedTypes: options.allowedTypes || [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ],
      typeErrorMessage:
        options.typeErrorMessage ||
        'يجب أن يكون الملف صورة (JPEG أو PNG أو WebP)',
      sizeErrorMessage:
        options.sizeErrorMessage ||
        `حجم الصورة يجب ألا يتجاوز ${maxSize / (1024 * 1024)} ميجابايت`,
    };
  }
  async transform(file: Express.Multer.File) {
    if (this.options.isRequired && !file) {
      throw new BadRequestException('الصورة مطلوبة');
    }
    if (!file) {
      return file;
    }
    try {
      const image = sharp(file.buffer);
      const imageMetadata = await image.metadata();

      if (!imageMetadata.format) {
        throw new BadRequestException(this.options.typeErrorMessage);
      }

      const formatToMimeType: Record<string, string> = {
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        bmp: 'image/bmp',
        tiff: 'image/tiff',
      };

      const detectedMimeType = formatToMimeType[imageMetadata.format];
      if (
        !detectedMimeType ||
        !this.options.allowedTypes.includes(detectedMimeType)
      ) {
        throw new BadRequestException(this.options.typeErrorMessage);
      }

      if (file.size > this.options.maxSize) {
        throw new BadRequestException(this.options.sizeErrorMessage);
      }

      file.mimetype = detectedMimeType;

      return file;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(this.options.typeErrorMessage);
    }
  }
}
