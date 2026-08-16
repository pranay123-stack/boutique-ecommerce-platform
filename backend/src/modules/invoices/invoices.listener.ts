import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InvoicesService } from './invoices.service';

/**
 * A tax invoice must be issued at or before the removal of goods, so it is
 * raised the moment an order is confirmed for fulfilment - whether the money
 * arrived through the gateway or is still to be collected at the door.
 */
@Injectable()
export class InvoicesListener {
  private readonly logger = new Logger(InvoicesListener.name);

  constructor(private readonly invoices: InvoicesService) {}

  @OnEvent('order.paid', { async: true })
  @OnEvent('order.confirmed.cod', { async: true })
  async onConfirmed(payload: { orderId: string; orderNumber?: string }) {
    try {
      await this.invoices.issueForOrder(payload.orderId);
    } catch (err) {
      // Never let invoicing fail a confirmed order - it is recoverable, and
      // the admin can reissue. Losing the order would not be.
      this.logger.error(
        `Failed to issue invoice for order ${payload.orderNumber ?? payload.orderId}: ${(err as Error).message}`,
      );
    }
  }
}
