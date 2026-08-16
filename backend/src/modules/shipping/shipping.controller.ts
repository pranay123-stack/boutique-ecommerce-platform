import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShippingService } from './shipping.service';
import { CreateShipmentDto, RateQuoteDto, ValidateAddressDto } from './dto/shipping.dto';
import { Audit, Public, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('validate-address')
  @Public()
  // POST because the address travels in the body, but nothing is created -
  // 201 would be a lie to any client that checks the status.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate and check serviceability of a delivery address' })
  validateAddress(@Body() dto: ValidateAddressDto) {
    return this.shipping.validateAddress(dto);
  }

  @Post('rates')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Available carriers and charges for a destination' })
  getRates(@Body() dto: RateQuoteDto) {
    return this.shipping.getRates(dto);
  }
}

@ApiTags('Admin / Shipping')
@ApiBearerAuth()
@Controller('admin/shipping')
export class AdminShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('orders/:orderId/shipments')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @Audit('shipment.create', 'Shipment')
  @ApiOperation({ summary: 'Book a shipment for a paid order' })
  create(@Param('orderId') orderId: string, @Body() dto: CreateShipmentDto) {
    return this.shipping.createShipment(orderId, dto.courierId);
  }

  @Get('orders/:orderId/shipments')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  @ApiOperation({ summary: 'Shipments booked against an order' })
  findByOrder(@Param('orderId') orderId: string) {
    return this.shipping.findByOrder(orderId);
  }

  @Post('shipments/:id/sync')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @ApiOperation({ summary: 'Pull the latest carrier tracking events' })
  sync(@Param('id') id: string) {
    return this.shipping.syncTracking(id);
  }

  @Post('sync-all')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @ApiOperation({ summary: 'Refresh tracking for every active shipment' })
  syncAll() {
    return this.shipping.syncAllActive();
  }

  @Delete('shipments/:id')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @Audit('shipment.cancel', 'Shipment')
  @ApiOperation({ summary: 'Cancel a shipment with the carrier' })
  cancel(@Param('id') id: string) {
    return this.shipping.cancelShipment(id);
  }
}
