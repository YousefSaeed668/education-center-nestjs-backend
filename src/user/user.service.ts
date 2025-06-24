import { Injectable } from '@nestjs/common';
import { ImageService } from 'src/common/services/image.service';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly imageService: ImageService,
  ) {}
  async findUserById(id: number) {
    return await this.prisma.user.findUnique({
      where: {
        id,
      },
    });
  }
  async findUserByUsername(userName: string) {
    return await this.prisma.user.findUnique({
      where: {
        userName,
      },
    });
  }
  async handleProfilePictureUpdate(
    currentProfilePicture: string | null,
    file: Express.Multer.File,
    folder: string,
  ) {
    const compressedFile = await this.imageService.compressImage(file, {}, 80);
    try {
      const { url } = await this.s3Service.uploadSingleFile({
        file: compressedFile,
        folder,
        isPublic: true,
      });

      if (currentProfilePicture) {
        await this.s3Service
          .deleteFileByUrl(currentProfilePicture)
          .catch((error) => {
            console.error('Failed to delete old profile picture:', error);
          });
      }
      return url;
    } catch (error) {
      throw new Error(`فشل في تحديث صورة الملف الشخصي: ${error.message}`);
    }
  }
  async updateHashedRefreshToken(userId: number, hashedRt: string | null) {
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshToken: hashedRt,
      },
    });
  }
}
