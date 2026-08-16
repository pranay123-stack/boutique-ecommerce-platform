import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Admin / Analytics')
@ApiBearerAuth()
@ApiQuery({ name: 'from', required: false, description: 'ISO date, defaults to 30 days ago' })
@ApiQuery({ name: 'to', required: false, description: 'ISO date, defaults to today' })
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Headline KPIs: revenue, orders, customers, alerts' })
  dashboard(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.getDashboard(from, to);
  }

  @Get('sales-series')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Daily revenue and order counts' })
  salesSeries(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.getSalesTimeSeries(from, to);
  }

  @Get('best-sellers')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Best selling products by units' })
  bestSellers(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getBestSellers(Math.min(Number(limit) || 10, 50), from, to);
  }

  @Get('revenue-by-category')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Revenue split by category' })
  revenueByCategory(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.getRevenueByCategory(from, to);
  }

  @Get('order-status')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Order counts and value by status' })
  orderStatus() {
    return this.analytics.getOrderStatusBreakdown();
  }

  @Get('top-customers')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Highest-spending customers' })
  topCustomers(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getTopCustomers(Math.min(Number(limit) || 10, 50), from, to);
  }

  @Get('reports/sales')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Flat sales report rows, ready for CSV export' })
  salesReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.getSalesReport(from, to);
  }
}
