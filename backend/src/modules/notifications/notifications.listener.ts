import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Translates domain events into customer notifications.
 *
 * Keeping this in a listener rather than inside the services means order,
 * payment and shipping logic never has to know that email exists - and a
 * broken template can never roll back a paid order.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Resolve the destination address for either a member or a guest. */
  private async resolveRecipient(payload: { userId?: string | null; email?: string | null }) {
    if (payload.email)
      return { email: payload.email, userId: payload.userId ?? null, firstName: 'there' };
    if (payload.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true, firstName: true },
      });
      if (user) return { email: user.email, userId: payload.userId, firstName: user.firstName };
    }
    return null;
  }

  private async safeDispatch(fn: () => Promise<unknown>, context: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Notification for ${context} failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('user.registered')
  async onUserRegistered(payload: {
    userId: string;
    email: string;
    firstName: string;
    verificationToken?: string;
  }) {
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'user.welcome',
          recipient: payload.email,
          userId: payload.userId,
          payload: {
            firstName: payload.firstName,
            verificationUrl: payload.verificationToken
              ? this.notifications.frontendUrl(`/verify-email?token=${payload.verificationToken}`)
              : undefined,
          },
        }),
      'user.registered',
    );
  }

  @OnEvent('user.verification_requested')
  async onVerificationRequested(payload: {
    userId: string;
    email: string;
    firstName: string;
    verificationToken: string;
  }) {
    await this.onUserRegistered(payload);
  }

  @OnEvent('user.password_reset_requested')
  async onPasswordReset(payload: {
    userId: string;
    email: string;
    firstName: string;
    token: string;
  }) {
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'user.password_reset',
          recipient: payload.email,
          userId: payload.userId,
          payload: {
            firstName: payload.firstName,
            resetUrl: this.notifications.frontendUrl(`/reset-password?token=${payload.token}`),
          },
        }),
      'user.password_reset_requested',
    );
  }

  @OnEvent('order.created')
  async onOrderCreated(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
    grandTotal: string;
  }) {
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'order.confirmation',
          recipient: to.email,
          userId: to.userId,
          payload: {
            orderNumber: payload.orderNumber,
            grandTotal: payload.grandTotal,
            orderUrl: this.notifications.frontendUrl(`/account/orders/${payload.orderId}`),
          },
        }),
      'order.created',
    );
  }

  @OnEvent('order.paid')
  async onOrderPaid(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
    grandTotal: string;
  }) {
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'payment.success',
          recipient: to.email,
          userId: to.userId,
          payload: {
            orderNumber: payload.orderNumber,
            grandTotal: payload.grandTotal,
            orderUrl: this.notifications.frontendUrl(`/account/orders/${payload.orderId}`),
          },
        }),
      'order.paid',
    );
  }

  @OnEvent('order.payment_failed')
  async onPaymentFailed(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
    reason: string;
  }) {
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'payment.failed',
          recipient: to.email,
          userId: to.userId,
          payload: {
            orderNumber: payload.orderNumber,
            reason: payload.reason,
            retryUrl: this.notifications.frontendUrl(
              `/checkout/payment?orderId=${payload.orderId}`,
            ),
          },
        }),
      'order.payment_failed',
    );
  }

  @OnEvent('order.status_changed')
  async onStatusChanged(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
    toStatus: string;
  }) {
    if (payload.toStatus !== 'PROCESSING') return;
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'order.processing',
          recipient: to.email,
          userId: to.userId,
          payload: {
            orderNumber: payload.orderNumber,
            orderUrl: this.notifications.frontendUrl(`/account/orders/${payload.orderId}`),
          },
        }),
      'order.status_changed',
    );
  }

  @OnEvent('order.cancelled')
  async onOrderCancelled(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
    requiresRefund: boolean;
  }) {
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'order.cancelled',
          recipient: to.email,
          userId: to.userId,
          payload: {
            orderNumber: payload.orderNumber,
            reason: payload.requiresRefund
              ? 'A refund has been initiated and will reach you shortly.'
              : 'No payment was taken for this order.',
          },
        }),
      'order.cancelled',
    );
  }

  @OnEvent('shipment.created')
  async onShipmentCreated(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
    awbCode: string | null;
    courierName: string | null;
    trackingUrl: string | null;
  }) {
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'shipment.created',
          recipient: to.email,
          userId: to.userId,
          payload: {
            orderNumber: payload.orderNumber,
            courierName: payload.courierName ?? 'our courier partner',
            awbCode: payload.awbCode ?? 'pending',
            trackingUrl:
              payload.trackingUrl ??
              this.notifications.frontendUrl(`/account/orders/${payload.orderId}`),
          },
        }),
      'shipment.created',
    );
  }

  @OnEvent('shipment.delivered')
  async onShipmentDelivered(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
  }) {
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'shipment.delivered',
          recipient: to.email,
          userId: to.userId,
          payload: {
            orderNumber: payload.orderNumber,
            reviewUrl: this.notifications.frontendUrl(`/account/orders/${payload.orderId}`),
          },
        }),
      'shipment.delivered',
    );
  }

  @OnEvent('refund.processed')
  async onRefundProcessed(payload: {
    orderId: string;
    orderNumber: string;
    userId?: string | null;
    email?: string | null;
    amount: string;
  }) {
    const to = await this.resolveRecipient(payload);
    if (!to) return;
    await this.safeDispatch(
      () =>
        this.notifications.dispatch({
          channel: NotificationChannel.EMAIL,
          template: 'refund.processed',
          recipient: to.email,
          userId: to.userId,
          payload: { orderNumber: payload.orderNumber, amount: payload.amount },
        }),
      'refund.processed',
    );
  }
}
