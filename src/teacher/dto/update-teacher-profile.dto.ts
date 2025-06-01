import {
  IsOptional,
  IsPhoneNumber,
  IsString,
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
          return 'Social media must be a valid JSON object with valid URLs for platforms: facebook, instagram, x, linkedIn, youtube';
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
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username must not exceed 20 characters' })
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Bio must not exceed 100 characters' })
  @MinLength(12, { message: 'Bio must be at least 3 characters long' })
  bio: string;

  @IsOptional()
  @IsString()
  @IsSocialMediaJSON()
  socialMedia: string;
}
