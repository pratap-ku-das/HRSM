import type { Readable } from 'node:stream';
import { getStorageConfig } from './storageConfig.js';
import { LocalStorageProvider } from './localStorageProvider.js';
import { S3StorageProvider } from './s3StorageProvider.js';

export class StorageError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = 'STORAGE_ERROR', status = 500) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.status = status;
  }
}

export class StorageObjectNotFoundError extends StorageError {
  constructor(key: string) {
    super(`Stored object not found: ${key}`, 'STORAGE_OBJECT_NOT_FOUND', 404);
    this.name = 'StorageObjectNotFoundError';
  }
}

export class StorageAccessDeniedError extends StorageError {
  constructor(message = 'Access denied to storage resource.') {
    super(message, 'STORAGE_ACCESS_DENIED', 403);
    this.name = 'StorageAccessDeniedError';
  }
}

export class StorageKeyInvalidError extends StorageError {
  constructor(message = 'Storage key is invalid or contains forbidden path characters.') {
    super(message, 'STORAGE_KEY_INVALID', 400);
    this.name = 'StorageKeyInvalidError';
  }
}

export class StorageIntegrityError extends StorageError {
  constructor(message = 'Stored object failed integrity verification.') {
    super(message, 'STORAGE_INTEGRITY_MISMATCH', 500);
    this.name = 'StorageIntegrityError';
  }
}

/**
 * Validates that an object key:
 * - Is non-empty
 * - Contains no parent traversal ('..')
 * - Does not begin with slash or backslash
 * - Contains only safe alphanumeric, dash, dot, and slash path elements
 */
export function assertValidStorageKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new StorageKeyInvalidError('Storage key must be a non-empty string.');
  }

  const normalized = key.trim();
  if (
    normalized.length === 0 ||
    normalized.includes('..') ||
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    normalized.startsWith('\\')
  ) {
    throw new StorageKeyInvalidError(`Invalid storage key format: "${key}"`);
  }

  const segments = normalized.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || !/^[a-zA-Z0-9_.-]+$/.test(seg)) {
      throw new StorageKeyInvalidError(`Storage key segment "${seg}" contains invalid characters.`);
    }
  }
}

export interface StoredObjectMetadata {
  key: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  lastModified?: Date;
}

export interface PutObjectResult {
  key: string;
  sha256: string;
  sizeBytes: number;
}

export interface GetObjectResult {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
  sha256?: string;
  lastModified?: Date;
}

export interface OpenReadStreamResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  sha256?: string;
  lastModified?: Date;
}

export interface StorageService {
  readonly providerName: 'local' | 's3';

  putObject(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<PutObjectResult>;

  getObject(key: string): Promise<GetObjectResult>;

  openReadStream(key: string): Promise<OpenReadStreamResult>;

  createPresignedDownloadUrl(params: {
    key: string;
    expiresInSeconds?: number;
    fileName?: string;
    contentType?: string;
  }): Promise<string>;

  deleteObject(key: string): Promise<void>;

  objectExists(key: string): Promise<boolean>;
}

let activeStorageService: StorageService | null = null;

export function getStorageService(overrideConfig?: ReturnType<typeof getStorageConfig>): StorageService {
  if (overrideConfig) {
    return overrideConfig.provider === 's3'
      ? new S3StorageProvider(overrideConfig)
      : new LocalStorageProvider(overrideConfig.storageRoot);
  }

  if (!activeStorageService) {
    const config = getStorageConfig();
    activeStorageService = config.provider === 's3'
      ? new S3StorageProvider(config)
      : new LocalStorageProvider(config.storageRoot);
  }

  return activeStorageService;
}

export function resetStorageService(): void {
  activeStorageService = null;
}
