import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportService } from './support.service';
import {
  AdminContactQueryDto,
  CreateContactMessageDto,
  UpdateContactMessageDto,
} from './dto/contact.dto';
import {
  Audit,
  CurrentUser,
  Public,
  RequirePermissions,
  type AuthenticatedUser,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('contact')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  // An unauthenticated endpoint that sends email is a spam relay if it is not
  // capped. Five a minute is generous for a person and useless to a bot.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Send a message to customer support' })
  submit(@Body() dto: CreateContactMessageDto, @Ip() ip: string, @Req() req: Request) {
    return this.support.submit(dto, { ipAddress: ip, userAgent: req.headers['user-agent'] });
  }
}

@ApiTags('Admin · Support')
@ApiBearerAuth()
@Controller('admin/support')
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}

  @Get('contact')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Messages from the contact form' })
  findAll(@Query() query: AdminContactQueryDto) {
    return this.support.findAll(query);
  }

  @Patch('contact/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @Audit('support.contact.update', 'ContactMessage')
  @ApiOperation({ summary: 'Triage a contact message' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.update(id, dto, user.id);
  }
}
