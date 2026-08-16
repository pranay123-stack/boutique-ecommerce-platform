import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService, type OrderIdentity } from './orders.service';
import { OrdersAdminService } from './orders-admin.service';
import { CancelOrderDto, CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AdminOrderQueryDto } from '../../common/dto/admin-query.dto';
import {
  Audit,
  CurrentUser,
  Public,
  RequirePermissions,
  SessionId,
  type AuthenticatedUser,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Orders')
@ApiHeader({ name: 'X-Session-Id', required: false, description: 'Guest session identifier' })
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  private identity(
    user: AuthenticatedUser | undefined,
    sessionId?: string,
    email?: string,
  ): OrderIdentity {
    return user?.id ? { userId: user.id } : { sessionId, email };
  }

  @Post()
  @Public()
  @Audit('order.create', 'Order')
  @ApiOperation({
    summary: 'Place an order from the active cart',
    description: 'Supports both guest and authenticated checkout. Reserves stock atomically.',
  })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @SessionId() sessionId: string,
  ) {
    return this.orders.create(this.identity(user, sessionId, dto.guestEmail), dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Order history for the signed-in customer' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.orders.findAllForCustomer({ userId: user.id }, query);
  }

  @Get('lookup/:orderNumber')
  @Public()
  @ApiQuery({ name: 'email', required: false, description: 'Required for guest order lookup' })
  @ApiOperation({ summary: 'Look up an order by number (guest tracking)' })
  lookup(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.orders.findByNumber(
      orderNumber,
      this.identity(user, undefined, email?.toLowerCase()),
    );
  }

  @Get(':id')
  @Public()
  @ApiQuery({ name: 'email', required: false })
  @ApiOperation({ summary: 'Order detail with items, payments, shipments and history' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.orders.findOne(id, this.identity(user, undefined, email?.toLowerCase()));
  }

  @Patch(':id/cancel')
  @Public()
  @Audit('order.cancel', 'Order')
  @ApiOperation({ summary: 'Cancel an order that has not shipped' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.orders.cancel(id, this.identity(user, undefined, email?.toLowerCase()), dto.reason);
  }
}

@ApiTags('Admin / Orders')
@ApiBearerAuth()
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly admin: OrdersAdminService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  @ApiOperation({ summary: 'Search and filter all orders' })
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.admin.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  @ApiOperation({ summary: 'Full order record for fulfilment' })
  findOne(@Param('id') id: string) {
    return this.admin.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @Audit('order.status_change', 'Order')
  @ApiOperation({
    summary: 'Advance the order lifecycle',
    description: 'Validated against the order state machine; illegal transitions are rejected.',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.admin.updateStatus(id, dto.status, dto.note, actorUserId);
  }

  @Patch(':id/note')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @Audit('order.note', 'Order')
  @ApiOperation({ summary: 'Attach an internal note' })
  addNote(@Param('id') id: string, @Body('note') note: string) {
    return this.admin.addInternalNote(id, note);
  }
}
