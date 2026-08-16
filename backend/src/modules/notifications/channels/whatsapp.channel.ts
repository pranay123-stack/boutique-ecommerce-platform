import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import type { INotificationChannel, SendMessageInput, SendResult } from './channel.interface';

/**
 * WhatsApp Business delivery via the Meta Cloud API.
 *
 * Meta only permits free-form text inside a 24-hour customer service window;
 * outside it, messages must use a pre-approved template. Order updates are
 * usually unsolicited, so the default path sends a template and falls back to
 * plain text when no template name is configured.
 *
 * Set WHATSAPP_PROVIDER=meta with WHATSAPP_API_KEY (permanent access token) and
 * WHATSAPP_PHONE_NUMBER_ID. With NOTIFICATIONS_MODE=mock nothing is sent.
 */
@Injectable()
export class WhatsappChannel implements INotificationChannel {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsappChannel.name);
  private readonly mode: string;
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly phoneNumberId: string;
  private readonly templateName: string;
  private readonly templateLang: string;

  constructor(config: ConfigService) {
    this.mode = config.get<string>('notifications.mode') ?? 'mock';
    this.provider = config.get<string>('notifications.whatsapp.provider') ?? 'mock';
    this.apiKey = config.get<string>('notifications.whatsapp.apiKey') ?? '';
    this.phoneNumberId = config.get<string>('notifications.whatsapp.phoneNumberId') ?? '';
    this.templateName = config.get<string>('notifications.whatsapp.templateName') ?? '';
    this.templateLang = config.get<string>('notifications.whatsapp.templateLang') ?? 'en';
  }

  async send(input: SendMessageInput): Promise<SendResult> {
    if (this.mode === 'mock' || this.provider === 'mock') {
      this.logger.log(`[MOCK WHATSAPP] to=${input.recipient} :: ${input.text.slice(0, 120)}`);
      return { success: true, providerMessageId: `mock-wa-${Date.now()}` };
    }
    if (!this.apiKey) return { success: false, error: 'WhatsApp provider is not configured' };
    if (this.provider !== 'meta') {
      return { success: false, error: `Unsupported WhatsApp provider: ${this.provider}` };
    }
    if (!this.phoneNumberId) {
      return { success: false, error: 'WHATSAPP_PHONE_NUMBER_ID is required' };
    }

    // Meta expects an E.164 number without the leading +.
    const to = input.recipient.replace(/\D/g, '');

    const payload = this.templateName
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: this.templateName,
            language: { code: this.templateLang },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: input.text.slice(0, 1024) }] },
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: input.text.slice(0, 4096) },
        };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        const message = body.error?.message ?? `HTTP ${response.status}`;
        this.logger.error(`WhatsApp send failed to ${to}: ${message}`);
        return { success: false, error: message };
      }
      return { success: true, providerMessageId: body.messages?.[0]?.id };
    } catch (err) {
      const message =
        (err as Error).name === 'AbortError' ? 'WhatsApp API timed out' : (err as Error).message;
      this.logger.error(`WhatsApp send failed to ${to}: ${message}`);
      return { success: false, error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}
