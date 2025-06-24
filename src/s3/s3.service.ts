import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
        expiresIn: 60 * 60 * 24,
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
}
