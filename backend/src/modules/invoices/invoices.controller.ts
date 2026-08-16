import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from './invoices.service';
import { renderInvoiceHtml, type InvoiceView } from './invoice-html';
import { renderInvoicePdf } from './invoice-pdf';
import { CurrentUser, Public, type AuthenticatedUser } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Invoices')
@ApiHeader({ name: 'X-Guest-Email', required: false, description: 'Guest order lookup' })
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('order/:orderId')
  @Public()
  @ApiOperation({ summary: 'Download the tax invoice for an order' })
  @ApiQuery({ name: 'format', required: false, enum: ['html', 'pdf'] })
  @Header('Cache-Control', 'private, no-store')
  async byOrder(
    @Param('orderId') orderId: string,
    @Res() res: Response,
    @CurrentUser() user?: AuthenticatedUser,
    @Query('format') format?: string,
    @Query('email') email?: string,
  ) {
    await this.assertOwnership(orderId, user, email);

    const view = (await this.invoices.viewForOrder(orderId)) as unknown as InvoiceView;
    const filename = `invoice-${view.invoice.invoiceNumber.replace(/\//g, '-')}`;

    if (format === 'pdf') {
      const pdf = await renderInvoicePdf(view);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      res.setHeader('Content-Length', pdf.length);
      res.end(pdf);
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderInvoiceHtml(view));
  }

  /**
   * An invoice carries the customer's name, address and phone number, so it is
   * gated exactly like the order it belongs to: the owning account, or a guest
   * who can quote the email the order was placed with.
   */
  private async assertOwnership(
    orderId: string,
    user: AuthenticatedUser | undefined,
    email: string | undefined,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, guestEmail: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (user?.id && order.userId === user.id) return;
    // Staff who can already read the order can read its invoice.
    if (user?.permissions?.includes(PERMISSIONS.ORDER_READ)) return;
    if (!order.userId && email && order.guestEmail === email.trim().toLowerCase()) return;

    throw new ForbiddenException('You do not have access to this invoice');
  }
}
