import { Controller, Get, Param, ParseEnumPipe } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetSignUpDataDto } from './dto/get-signup-data.dto';
import { LookupService } from './lookup.service';

@Public()
@Controller('lookup')
export class LookupController {
  constructor(private readonly lookupService: LookupService) {}
  @Get('signup/:userType')
  getSignUpData(@Param() params: GetSignUpDataDto) {
    return this.lookupService.getSignUpData(params.userType);
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
}
