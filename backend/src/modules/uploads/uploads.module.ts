import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { LocalStorageProvider } from './providers/local.storage';
import { S3StorageProvider } from './providers/s3.storage';
import { STORAGE_PROVIDER } from './providers/storage.interface';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Buffer in memory so magic-byte validation runs before anything
        // untrusted is ever written to disk.
        storage: memoryStorage(),
        limits: {
          fileSize: (config.get<number>('storage.maxUploadSizeMb') ?? 5) * 1024 * 1024,
          files: 10,
        },
      }),
    }),
  ],
  providers: [
    UploadsService,
    LocalStorageProvider,
    {
      provide: S3StorageProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('storage.driver') === 's3' ? new S3StorageProvider(config) : null,
    },
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider, S3StorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
        s3: S3StorageProvider | null,
      ) => {
        const driver = config.get<string>('storage.driver');
        if (driver === 's3') {
          if (!s3) throw new Error('STORAGE_DRIVER=s3 but the S3 client could not be created');
          return s3;
        }
        return local;
      },
    },
  ],
  controllers: [UploadsController],
  exports: [UploadsService, STORAGE_PROVIDER],
})
export class UploadsModule {}
