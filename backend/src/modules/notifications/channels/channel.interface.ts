import type { NotificationChannel } from '@prisma/client';

export interface SendMessageInput {
  recipient: string;
  subject?: string;
  html?: string;
  text: string;
}

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface INotificationChannel {
  readonly channel: NotificationChannel;
  send(input: SendMessageInput): Promise<SendResult>;
}
