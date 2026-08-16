import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  AdminUpdateUserDto,
  CreateAddressDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/user.dto';
import { AdminCustomerQueryDto } from '../../common/dto/admin-query.dto';
import { Audit, CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Account')
@ApiBearerAuth()
@Controller('account')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Profile of the signed-in customer' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.users.getProfile(userId);
  }

  @Patch('profile')
  @Audit('account.update_profile', 'User')
  @ApiOperation({ summary: 'Update name and phone' })
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  @Get('addresses')
  @ApiOperation({ summary: 'Saved addresses' })
  listAddresses(@CurrentUser('id') userId: string) {
    return this.users.listAddresses(userId);
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Save a new address' })
  createAddress(@CurrentUser('id') userId: string, @Body() dto: CreateAddressDto) {
    return this.users.createAddress(userId, dto);
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Update a saved address' })
  updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.users.updateAddress(userId, id, dto);
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Delete a saved address' })
  deleteAddress(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.users.deleteAddress(userId, id);
  }
}

@ApiTags('Admin / Customers')
@ApiBearerAuth()
@Controller('admin/customers')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Search customers' })
  findAll(@Query() query: AdminCustomerQueryDto) {
    return this.users.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Customer detail with order history and lifetime value' })
  findOne(@Param('id') id: string) {
    return this.users.findOneAdmin(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @Audit('customer.update', 'User')
  @ApiOperation({ summary: 'Update customer details, status or role' })
  update(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.users.updateByAdmin(id, dto);
  }
}
