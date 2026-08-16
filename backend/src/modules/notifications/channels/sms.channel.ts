import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import type { INotificationChannel, SendMessageInput, SendResult } from './channel.interface';

/**
 * SMS delivery.
 *
 * Two providers are implemented because they cover most deployments: Twilio
 * internationally, MSG91 for India (where this store's default currency and
 * PIN-code validation point). Adding another is one more case in `send`.
 *
 * Set SMS_PROVIDER=twilio|msg91 plus the matching credentials. With
 * NOTIFICATIONS_MODE=mock (the default) nothing leaves the machine.
 */
@Injectable()
export class SmsChannel implements INotificationChannel {
  readonly channel = NotificationChannel.SMS;
  private readonly logger = new Logger(SmsChannel.name);
  private readonly mode: string;
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly accountSid: string;

  constructor(config: ConfigService) {
    this.mode = config.get<string>('notifications.mode') ?? 'mock';
    this.provider = config.get<string>('notifications.sms.provider') ?? 'mock';
    this.apiKey = config.get<string>('notifications.sms.apiKey') ?? '';
    this.senderId = config.get<string>('notifications.sms.senderId') ?? 'BOUTIQ';
    this.accountSid = config.get<string>('notifications.sms.accountSid') ?? '';
  }

  async send(input: SendMessageInput): Promise<SendResult> {
    if (this.mode === 'mock' || this.provider === 'mock') {
      this.logger.log(`[MOCK SMS] to=${input.recipient} :: ${input.text.slice(0, 120)}`);
      return { success: true, providerMessageId: `mock-sms-${Date.now()}` };
    }
    if (!this.apiKey) return { success: false, error: 'SMS provider is not configured' };

    // SMS is a 160-character medium; templates render a long-form body for
    // email, so trim rather than let the carrier truncate mid-word.
    const body = input.text.length > 320 ? `${input.text.slice(0, 317)}...` : input.text;

    try {
      switch (this.provider) {
        case 'twilio':
          return await this.sendViaTwilio(input.recipient, body);
        case 'msg91':
          return await this.sendViaMsg91(input.recipient, body);
        default:
          return { success: false, error: `Unsupported SMS provider: ${this.provider}` };
      }
    } catch (err) {
      this.logger.error(`SMS send failed to ${input.recipient}: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  private async sendViaTwilio(to: string, body: string): Promise<SendResult> {
    if (!this.accountSid)
      return { success: false, error: 'SMS_ACCOUNT_SID is required for Twilio' };

    const res = await this.request(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          // Twilio uses basic auth: account SID as user, auth token as password.
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: this.senderId, Body: body }).toString(),
      },
    );
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, providerMessageId: (res.body as { sid?: string }).sid };
  }

  private async sendViaMsg91(to: string, body: string): Promise<SendResult> {
    // MSG91 expects a bare national number for Indian destinations.
    const mobile = to.replace(/\D/g, '').replace(/^0+/, '');
    const res = await this.request('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: { authkey: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: this.senderId,
        route: '4', // transactional
        country: '91',
        sms: [{ message: body, to: [mobile] }],
      }),
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, providerMessageId: (res.body as { request_id?: string }).request_id };
  }

  /** Shared fetch with a timeout so a hung provider cannot stall the worker. */
  private async request(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; body: unknown; error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      return {
        ok: response.ok,
        body,
        error: response.ok ? '' : `${response.status}: ${JSON.stringify(body).slice(0, 200)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
