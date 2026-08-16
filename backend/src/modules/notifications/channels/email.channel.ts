import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type { INotificationChannel, SendMessageInput, SendResult } from './channel.interface';

@Injectable()
export class EmailChannel implements INotificationChannel {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailChannel.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly mode: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.mode = this.config.get<string>('notifications.mode') ?? 'mock';
    this.from = this.config.get<string>('notifications.mailFrom') as string;
  }

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;
    const smtp = this.config.get<{
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      password?: string;
    }>('notifications.smtp')!;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
      pool: true,
      maxConnections: 5,
    });
    return this.transporter;
  }

  async send(input: SendMessageInput): Promise<SendResult> {
    // In mock mode the message is logged rather than sent, so development and
    // CI never depend on an SMTP server being reachable.
    if (this.mode === 'mock') {
      this.logger.log(`[MOCK EMAIL] to=${input.recipient} subject="${input.subject ?? ''}"`);
      return { success: true, providerMessageId: `mock-${Date.now()}` };
    }
    try {
      const info = await this.getTransporter().sendMail({
        from: this.from,
        to: input.recipient,
        subject: input.subject ?? 'Notification',
        text: input.text,
        html: input.html ?? `<p>${input.text}</p>`,
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (err) {
      this.logger.error(`Email send failed to ${input.recipient}: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }
}
