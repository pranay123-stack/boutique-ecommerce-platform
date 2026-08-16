import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  STORAGE_PROVIDER,
  type IStorageProvider,
  type StoredFile,
} from './providers/storage.interface';

/**
 * Upload validation and storage.
 *
 * File uploads are a classic attack surface: a client-declared MIME type is
 * just a string, and `.jpg` in a filename means nothing. Every upload is
 * therefore checked against its actual magic bytes, given a server-generated
 * name, and stored with an extension derived from the detected type - not
 * from anything the client sent.
 */
@Injectable()
export class UploadsService {
  private readonly maxBytes: number;

  /** Magic-byte signatures for the formats we accept. */
  private static readonly SIGNATURES: Array<{
    mime: string;
    ext: string;
    test: (b: Buffer) => boolean;
  }> = [
    {
      mime: 'image/jpeg',
      ext: 'jpg',
      test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    },
    {
      mime: 'image/png',
      ext: 'png',
      test: (b) =>
        b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    },
    {
      mime: 'image/webp',
      ext: 'webp',
      test: (b) =>
        b.subarray(0, 4).toString('ascii') === 'RIFF' &&
        b.subarray(8, 12).toString('ascii') === 'WEBP',
    },
    { mime: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
    {
      mime: 'image/avif',
      ext: 'avif',
      test: (b) =>
        b.subarray(4, 8).toString('ascii') === 'ftyp' &&
        b.subarray(8, 12).toString('ascii').startsWith('avif'),
    },
  ];

  constructor(
    config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {
    this.maxBytes = (config.get<number>('storage.maxUploadSizeMb') ?? 5) * 1024 * 1024;
  }

  async uploadImage(
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
    folder = 'products',
  ): Promise<StoredFile> {
    if (!file?.buffer?.length) throw new BadRequestException('No file was uploaded');
    if (file.size > this.maxBytes) {
      throw new BadRequestException(
        `File exceeds the ${Math.round(this.maxBytes / 1024 / 1024)}MB limit`,
      );
    }

    const detected = UploadsService.SIGNATURES.find((s) => s.test(file.buffer));
    if (!detected) {
      throw new BadRequestException('Unsupported file type. Allowed: JPEG, PNG, WebP, GIF, AVIF');
    }

    // An SVG or HTML payload renamed to .png would be caught above; this
    // second check catches a mismatch between claim and reality.
    if (file.mimetype && !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are permitted');
    }

    const safeFolder = folder.replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'misc';
    const key = `${safeFolder}/${Date.now()}-${randomBytes(8).toString('hex')}.${detected.ext}`;

    return this.storage.upload(file.buffer, key, detected.mime);
  }

  async uploadMany(
    files: Array<{ buffer: Buffer; mimetype: string; size: number; originalname: string }>,
    folder = 'products',
  ) {
    if (!files?.length) throw new BadRequestException('No files were uploaded');
    if (files.length > 10) throw new BadRequestException('At most 10 files per request');
    return Promise.all(files.map((f) => this.uploadImage(f, folder)));
  }

  async delete(key: string): Promise<{ success: true }> {
    await this.storage.delete(key);
    return { success: true };
  }
}
