import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';

function IsSocialMediaJSON(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isSocialMediaJSON',
      validator: {
        validate(value: any) {
          if (!value) return true;
          try {
            const parsed = JSON.parse(value);

            if (
              typeof parsed !== 'object' ||
              parsed === null ||
              Array.isArray(parsed)
            ) {
              return false;
            }

            const validKeys = [
              'facebook',
              'instagram',
              'x',
              'linkedIn',
              'youtube',
            ];
            const keys = Object.keys(parsed);

            for (const key of keys) {
              if (!validKeys.includes(key)) {
                return false;
              }

              if (parsed[key] && typeof parsed[key] === 'string') {
                try {
                  new URL(parsed[key]);
                } catch {
                  return false;
                }
              }
            }

            return true;
          } catch {
            return false;
          }
        },
        defaultMessage() {
          return 'وسائل التواصل الاجتماعي يجب أن تكون كائن JSON صالح مع روابط صحيحة للمنصات: facebook, instagram, x, linkedIn, youtube';
        },
      },
    },
    validationOptions,
  );
}

export class UpdateTeacherProfileDto {
  @IsOptional()
  @IsPhoneNumber('EG')
  phoneNumber: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' })
  @MaxLength(30, { message: 'اسم المستخدم يجب ألا يتجاوز 30 حرف' })
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'النبذة التعريفية يجب ألا تتجاوز 160 حرف' })
  @MinLength(12, { message: 'النبذة التعريفية يجب أن تكون 12 حرف على الأقل' })
  bio: string;

  @IsOptional()
  @IsString()
  @IsSocialMediaJSON()
  socialMedia: string;

  @IsStrongPassword({
    minSymbols: 0,
  })
  @IsOptional()
  password?: string;

  @IsOptional()
  gradeIds: number[];

  @IsOptional()
  divisionIds: number[];
}
