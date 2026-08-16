import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { IStorageProvider, StoredFile } from './storage.interface';

/**
 * Filesystem storage for local development.
 *
 * Files are served by the static middleware registered in main.ts. Not
 * intended for multi-instance production - use the S3 driver there.
 */
@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  readonly driver = 'local';
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('storage.localPath') ?? './uploads');
    this.publicBase = config.get<string>('storage.publicBaseUrl') as string;
  }

  async upload(buffer: Buffer, key: string, mimeType: string): Promise<StoredFile> {
    const target = join(this.root, key);

    // Defence in depth: a crafted key must never escape the uploads root.
    if (!target.startsWith(this.root)) {
      throw new Error('Invalid storage key');
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    this.logger.debug(`Stored ${key} (${buffer.length} bytes)`);

    return { key, url: this.getUrl(key), size: buffer.length, mimeType };
  }

  async delete(key: string): Promise<void> {
    const target = join(this.root, key);
    if (!target.startsWith(this.root)) throw new Error('Invalid storage key');
    await unlink(target).catch(() => undefined);
  }

  getUrl(key: string): string {
    return `${this.publicBase.replace(/\/$/, '')}/${key}`;
  }
}
