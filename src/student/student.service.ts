import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { UserService } from 'src/user/user.service';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { HelperFunctionsService } from 'src/common/services/helperfunctions.service';

@Injectable()
export class StudentService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  async updateProfile(
    studentId: number,
    body: UpdateStudentProfileDto,
    file?: Express.Multer.File,
  ) {
    let newProfilePictureUrl: string | undefined;
    try {
      if (file) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: studentId },
          select: { profilePicture: true },
        });

        newProfilePictureUrl =
          await this.userService.handleProfilePictureUpdate(
            currentUser?.profilePicture || null,
            file,
            'student/profile-picture',
          );
      }
      const userData = HelperFunctionsService.removeUndefined({
        profilePicture: newProfilePictureUrl,
        displayName: body.displayName,
        phoneNumber: body.phoneNumber,
      });

      const studentData = HelperFunctionsService.removeUndefined({
        governmentId: body.governmentId,
        cityId: body.cityId,
        educationTypeId: body.educationTypeId,
        secondLangId: body.secondLangId,
        schoolTypeId: body.schoolTypeId,
        parentPhoneNumber: body.parentPhoneNumber,
        gradeId: body.gradeId,
        divisionId: body.divisionId,
        schoolName: body.schoolName,
      });
      await this.prisma.$transaction(async (tx) => {
        return await tx.user.update({
          where: { id: studentId },
          data: {
            ...userData,
            ...(Object.keys(studentData).length > 0 && {
              student: {
                update: studentData,
              },
            }),
          },
          include: {
            student: true,
          },
        });
      });

      return {
        message: 'تم تحديث الملف الشخصي بنجاح',
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
}
