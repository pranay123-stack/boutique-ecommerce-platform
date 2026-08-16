import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { IStorageProvider, StoredFile } from './storage.interface';

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, DigitalOcean
 * Spaces). `forcePathStyle` is what makes the non-AWS endpoints work.
 */
@Injectable()
export class S3StorageProvider implements IStorageProvider {
  readonly driver = 's3';
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    const s3 = config.get<{
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
    }>('storage.s3')!;

    this.bucket = s3.bucket;
    this.publicBase =
      config.get<string>('storage.publicBaseUrl') ||
      (s3.endpoint
        ? `${s3.endpoint}/${s3.bucket}`
        : `https://${s3.bucket}.s3.${s3.region}.amazonaws.com`);

    this.client = new S3Client({
      region: s3.region,
      ...(s3.endpoint ? { endpoint: s3.endpoint } : {}),
      forcePathStyle: s3.forcePathStyle,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
  }

  async upload(buffer: Buffer, key: string, mimeType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // Catalogue images are immutable once uploaded - cache them hard.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    this.logger.debug(`Uploaded s3://${this.bucket}/${key}`);
    return { key, url: this.getUrl(key), size: buffer.length, mimeType };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getUrl(key: string): string {
    return `${this.publicBase.replace(/\/$/, '')}/${key}`;
  }
}
