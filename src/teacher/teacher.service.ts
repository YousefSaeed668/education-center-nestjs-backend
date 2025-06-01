import { Injectable, Logger } from '@nestjs/common';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { S3Service } from 'src/s3/s3.service';
import { PrismaService } from 'src/prisma.service';
import { ImageService } from 'src/common/services/image.service';

@Injectable()
export class TeacherService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly imageService: ImageService,
  ) {}
  async updateProfile(
    teacherId: number,
    body: UpdateTeacherProfileDto,
    file?: Express.Multer.File,
  ) {
    let newProfilePictureUrl: string | undefined;
    try {
      if (file) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: teacherId },
          select: { profilePicture: true },
        });

        newProfilePictureUrl = await this.handleProfilePictureUpdate(
          currentUser?.profilePicture || null,
          file,
        );
      }
      await this.prisma.$transaction(async (tx) => {
        return await tx.user.update({
          where: { id: teacherId },
          data: {
            ...(newProfilePictureUrl !== undefined && {
              profilePicture: newProfilePictureUrl,
            }),
            ...(body.displayName && { displayName: body.displayName }),
            ...(body.phoneNumber && { phoneNumber: body.phoneNumber }),
            Teacher: {
              update: {
                ...(body.bio !== undefined && { bio: body.bio }),
                ...(body.socialMedia !== undefined && {
                  socialMedia: JSON.parse(body.socialMedia),
                }),
              },
            },
          },
          include: {
            Teacher: true,
          },
        });
      });
      return {
        message: 'Profile updated successfully',
      };
    } catch (error) {
      if (newProfilePictureUrl && error) {
        await this.s3Service.deleteFileByUrl(newProfilePictureUrl).catch(() => {
          console.error(
            'Failed to cleanup uploaded file:',
            newProfilePictureUrl,
          );
        });
      }

      throw error;
    }
  }
  private async handleProfilePictureUpdate(
    currentProfilePicture: string | null,
    file: Express.Multer.File,
  ) {
    const compressedFile = await this.imageService.compressImage(file);
    try {
      const { url } = await this.s3Service.uploadSingleFile({
        file: compressedFile,
        folder: 'teacher/profile-picture',
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
      throw new Error(`Failed to update profile picture: ${error.message}`);
    }
  }
}
