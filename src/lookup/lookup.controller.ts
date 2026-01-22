import { Controller, Get, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductType } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetSignUpDataDto, SettingType } from './dto/get-signup-data.dto';
import { LookupService } from './lookup.service';

@ApiTags('lookup')
@Public()
@Controller('lookup')
export class LookupController {
  constructor(private readonly lookupService: LookupService) {}
  @Get('signup/:userType')
  getSignUpData(@Param() params: GetSignUpDataDto) {
    return this.lookupService.getSignUpData(params.userType);
  }

  @Get('platform-settings')
  getPlatformSettings(
    @Query('settingType', new ParseEnumPipe(SettingType))
    settingType: SettingType,
  ) {
    return this.lookupService.getPlatformSettings(settingType);
  }

  @Get('admin-filters')
  getAdminAdminFilters() {
    return this.lookupService.getAdminFilters();
  }

  @Get('products/:productType')
  getProductsData(
    @Param('productType', new ParseEnumPipe(ProductType))
    productType: ProductType,
  ) {
    return this.lookupService.getProductsData(productType);
  }

  @Get('teachers')
  getTeacherData() {
    return this.lookupService.getTeacherData();
  }

  @Get('locations')
  getLocationData() {
    return this.lookupService.getLocationData();
  }

  @Get('home-page')
  getHomePageData() {
    return this.lookupService.getHomePageData();
  }
}
