import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class GetFinancialStatisticsDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}
