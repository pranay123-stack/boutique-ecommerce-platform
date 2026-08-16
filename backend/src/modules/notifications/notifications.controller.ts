import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AdminNotificationQueryDto } from '../../common/dto/admin-query.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notification history for the signed-in customer' })
  findMine(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.notifications.findForUser(userId, query);
  }
}

@ApiTags('Admin / Notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Delivery log across all channels' })
  findAll(@Query() query: AdminNotificationQueryDto) {
    return this.notifications.findAll(query);
  }
}
