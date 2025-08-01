import { IsBoolean, IsNumber, Max, Min } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsBoolean()
  teacherRegistration: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(1.0)
  platformPercentage: number;
}
