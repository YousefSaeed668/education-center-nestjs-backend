import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
@Injectable()
export class S3Service {
  private client: S3Client;
  private bucketName: string;
  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get('S3_BUCKET_NAME')!;
    const s3_region = this.configService.get('S3_REGION');
    if (!s3_region) {
      throw new Error('S3_REGION غير موجود في متغيرات البيئة');
    }
    this.client = new S3Client({
      region: s3_region,
      credentials: {
        accessKeyId: this.configService.get('S3_ACCESS_KEY')!,
        secretAccessKey: this.configService.get('S3_SECRET_ACCESS_KEY')!,
      },
      forcePathStyle: true,
    });
  }

  async uploadSingleFile({
    file,
    isPublic = true,
    folder,
  }: {
    file: Express.Multer.File;
    isPublic?: boolean;
    folder: string;
  }) {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const uniqueFileName = `${uuidv4()}${fileExtension ? '.' + fileExtension : ''}`;
      const key = `${folder}/${uniqueFileName}`;
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });
      await this.client.send(command);
      return {
        url: isPublic
          ? this.getFileUrl(key).url
          : (await this.getPresignedSignedUrl(key)).url,
        isPublic,
      };
    } catch (error) {
      Logger.error('Error uploading file to S3:', error);
      throw new InternalServerErrorException(error);
    }
  }
  getFileUrl(key: string) {
    return { url: `https://${this.bucketName}.s3.amazonaws.com/${key}` };
  }

  extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      let encodedKey: string;

      if (urlObj.hostname.includes('.s3.amazonaws.com')) {
        encodedKey = urlObj.pathname.substring(1);
      } else if (urlObj.hostname === 's3.amazonaws.com') {
        const pathParts = urlObj.pathname.split('/');
        encodedKey = pathParts.slice(2).join('/');
      } else if (urlObj.hostname.includes('.s3.')) {
        encodedKey = urlObj.pathname.substring(1);
      } else {
        throw new Error(`تنسيق رابط S3 غير معروف: ${url}`);
      }

      const decodedKey = decodeURIComponent(encodedKey);

      return decodedKey;
    } catch (error) {
      throw new Error(`تنسيق رابط S3 غير صحيح: ${url} - ${error.message}`);
    }
  }
  async getPresignedSignedUrl(key: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: 60 * 5,
      });
      return { url };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async deleteFileByUrl(url: string) {
    try {
      const key = this.extractKeyFromUrl(url);
      return await this.deleteFile(key);
    } catch (error) {
      Logger.error('Error deleting file from S3:', error);
      throw new Error(`فشل في حذف الملف: ${error.message}`);
    }
  }
  async deleteFile(key: string) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client.send(command);
      return { message: 'تم حذف الملف بنجاح' };
    } catch (error) {
      throw new Error(error);
    }
  }
  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600,
    maxFileSize?: number,
  ): Promise<{ url: string; fields: Record<string, string> }> {
    try {
      const conditions: any[] = [
        { bucket: this.bucketName },
        { key: key },
        ['content-length-range', 0, maxFileSize || 100 * 1024 * 1024],
      ];

      const { url, fields } = await createPresignedPost(this.client, {
        Bucket: this.bucketName,
        Key: key,
        Conditions: conditions,
        Fields: {
          'Content-Type': contentType,
        },
        Expires: expiresIn,
      });

      return { url, fields };
    } catch (error) {
      Logger.error('Error generating pre-signed upload URL:', error);
      throw new InternalServerErrorException(
        'فشل في إنشاء رابط التحميل المؤقت',
      );
    }
  }
  async checkFileExists(key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      Logger.error('Error checking if file exists:', error);
      throw new InternalServerErrorException('فشل في التحقق من وجود الملف');
    }
  }
  async getFileStream(s3Key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new InternalServerErrorException('لا يمكن قراءة الملف من S3.');
      }

      return response.Body as unknown as Readable;
    } catch (error) {
      Logger.error('Error getting file stream from S3:', error);
      throw new InternalServerErrorException(
        `فشل في قراءة الملف من S3: ${error.message}`,
      );
    }
  }
}
