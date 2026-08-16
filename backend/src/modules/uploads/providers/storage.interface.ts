export interface StoredFile {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface IStorageProvider {
  readonly driver: string;
  upload(buffer: Buffer, key: string, mimeType: string): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
