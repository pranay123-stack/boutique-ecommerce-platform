import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';
import { AdminCouponQueryDto } from '../../common/dto/admin-query.dto';
import { Audit, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Admin / Coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COUPON_WRITE)
  @ApiOperation({ summary: 'List coupons with redemption counts' })
  findAll(@Query() query: AdminCouponQueryDto) {
    return this.coupons.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COUPON_WRITE)
  @ApiOperation({ summary: 'Coupon detail' })
  findOne(@Param('id') id: string) {
    return this.coupons.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COUPON_WRITE)
  @Audit('coupon.create', 'Coupon')
  @ApiOperation({ summary: 'Create a discount coupon' })
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COUPON_WRITE)
  @Audit('coupon.update', 'Coupon')
  @ApiOperation({ summary: 'Update a coupon' })
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COUPON_WRITE)
  @Audit('coupon.delete', 'Coupon')
  @ApiOperation({ summary: 'Delete an unused coupon, or deactivate a redeemed one' })
  remove(@Param('id') id: string) {
    return this.coupons.remove(id);
  }
}
