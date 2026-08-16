import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReturnsService, type ReturnIdentity } from './returns.service';
import {
  AdminReturnQueryDto,
  CreateReturnDto,
  InspectReturnDto,
  RETURN_REASONS,
  UpdateReturnStatusDto,
} from './dto/return.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  Audit,
  CurrentUser,
  Public,
  RequirePermissions,
  type AuthenticatedUser,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Returns')
@ApiHeader({ name: 'X-Guest-Email', required: false, description: 'Guest order lookup' })
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  private identity(user: AuthenticatedUser | undefined, email?: string): ReturnIdentity {
    return user?.id ? { userId: user.id } : { email: email?.trim().toLowerCase() };
  }

  @Get('reasons')
  @Public()
  @ApiOperation({ summary: 'Reasons a customer can pick when opening a return' })
  reasons() {
    return { reasons: RETURN_REASONS };
  }

  @Get('eligibility/:orderId')
  @Public()
  @ApiOperation({ summary: 'What can still be returned on an order, and until when' })
  @ApiQuery({ name: 'email', required: false, description: 'Required for guest orders' })
  eligibility(
    @Param('orderId') orderId: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.returns.eligibility(orderId, this.identity(user, email));
  }

  @Post()
  @Public()
  @Audit('return.request', 'ReturnRequest')
  @ApiOperation({ summary: 'Open a return request' })
  create(@Body() dto: CreateReturnDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.returns.request(this.identity(user, dto.guestEmail), dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your return requests' })
  mine(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.returns.findMine({ userId: user.id }, query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'A single return request' })
  @ApiQuery({ name: 'email', required: false })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.returns.findOne(id, this.identity(user, email));
  }

  @Patch(':id/cancel')
  @ApiBearerAuth()
  @Audit('return.cancel', 'ReturnRequest')
  @ApiOperation({ summary: 'Withdraw a return request' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.returns.cancel(id, { userId: user.id });
  }
}

@ApiTags('Admin · Returns')
@ApiBearerAuth()
@Controller('admin/returns')
export class ReturnsAdminController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  @ApiOperation({ summary: 'All return requests' })
  findAll(@Query() query: AdminReturnQueryDto) {
    return this.returns.findAll(query);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @Audit('return.status', 'ReturnRequest')
  @ApiOperation({ summary: 'Move a return along its lifecycle' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReturnStatusDto) {
    return this.returns.updateStatus(id, dto.status, dto.staffNote);
  }

  @Post(':id/inspect')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  @Audit('return.inspect', 'ReturnRequest')
  @ApiOperation({
    summary: 'Record the inspection outcome',
    description: 'Restocks saleable items and settles the refundable amount.',
  })
  inspect(@Param('id') id: string, @Body() dto: InspectReturnDto) {
    return this.returns.inspect(id, dto);
  }
}
