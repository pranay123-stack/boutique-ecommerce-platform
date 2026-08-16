import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AdjustStockDto, RestockDto, UpdateThresholdDto } from './dto/inventory.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Audit, CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Admin / Inventory')
@ApiBearerAuth()
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('low-stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Variants at or below their reorder threshold' })
  getLowStock(@Query() query: PaginationQueryDto) {
    return this.inventory.getLowStock(query);
  }

  @Get(':variantId')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Current stock position for a variant' })
  getStock(@Param('variantId') variantId: string) {
    return this.inventory.getStock(variantId);
  }

  @Get(':variantId/history')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Full movement history for a variant' })
  getHistory(@Param('variantId') variantId: string, @Query() query: PaginationQueryDto) {
    return this.inventory.getHistory(variantId, query);
  }

  @Patch(':variantId')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  @Audit('inventory.adjust', 'Inventory')
  @ApiOperation({ summary: 'Set an absolute stock quantity' })
  adjust(
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.adjust(variantId, dto, userId);
  }

  @Post(':variantId/restock')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  @Audit('inventory.restock', 'Inventory')
  @ApiOperation({ summary: 'Add units to stock' })
  restock(
    @Param('variantId') variantId: string,
    @Body() dto: RestockDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.restock(variantId, dto, userId);
  }

  @Patch(':variantId/threshold')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  @Audit('inventory.threshold', 'Inventory')
  @ApiOperation({ summary: 'Update the low-stock threshold' })
  setThreshold(@Param('variantId') variantId: string, @Body() dto: UpdateThresholdDto) {
    return this.inventory.setThreshold(variantId, dto.lowStockThreshold);
  }
}
