import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FileUploadRequestDto {
  @IsString()
  @MaxLength(255, {
    message: 'يجب ألا يتجاوز اسم الملف 255 حرفًا.',
  })
  fileName: string;

  @IsString()
  @Matches(
    /^video\/(mp4|mpeg|quicktime|x-msvideo|webm)$|^application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/,
    {
      message:
        'نوع ملف غير مدعوم. يُسمح فقط بملفات الفيديو (mp4, mpeg, mov, avi, webm) والمستندات (pdf, doc, docx, xls, xlsx)',
    },
  )
  contentType: string;

  @IsNumber()
  @Min(1)
  @Max(100 * 1024 * 1024)
  size: number;
}

export class GenerateUploadUrlsDto {
  @IsString()
  @MaxLength(255, { message: 'يجب ألا يتجاوز اسم المحاضرة 255 حرفًا.' })
  lectureName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileUploadRequestDto)
  files: FileUploadRequestDto[];
}
