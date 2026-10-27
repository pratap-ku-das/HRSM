import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from './storageConfig.js';
import {
  type StorageService,
  type PutObjectResult,
  type GetObjectResult,
  type OpenReadStreamResult,
  StorageObjectNotFoundError,
  StorageAccessDeniedError,
  StorageIntegrityError,
  StorageError,
  assertValidStorageKey,
} from './storageService.js';

export class S3StorageProvider implements StorageService {
  readonly providerName = 's3' as const;
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly kmsKeyId?: string;
  private readonly defaultPresignedUrlExpires: number;

  constructor(config: StorageConfig, s3ClientOverride?: S3Client) {
    this.bucket = config.s3.bucketName;
    this.kmsKeyId = config.s3.kmsKeyId;
    this.defaultPresignedUrlExpires = config.s3.presignedUrlExpiresSeconds;

    if (s3ClientOverride) {
      this.s3Client = s3ClientOverride;
    } else {
      const clientConfig: S3ClientConfig = {
        region: config.s3.region,
      };
      if (config.s3.endpoint) {
        clientConfig.endpoint = config.s3.endpoint;
      }
      if (config.s3.forcePathStyle !== undefined) {
        clientConfig.forcePathStyle = config.s3.forcePathStyle;
      }
      this.s3Client = new S3Client(clientConfig);
    }
  }

  async putObject(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<PutObjectResult> {
    assertValidStorageKey(params.key);
    const sha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');

    const metadata: Record<string, string> = {
      ...(params.metadata || {}),
      'sha256-checksum': sha256,
    };

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.key,
          Body: params.buffer,
          ContentType: params.contentType,
          ContentLength: params.buffer.length,
          Metadata: metadata,
          ServerSideEncryption: this.kmsKeyId ? 'aws:kms' : 'AES256',
          ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
        })
      );

      return {
        key: params.key,
        sha256,
        sizeBytes: params.buffer.length,
      };
    } catch (error: any) {
      this.handleS3Error(error, params.key);
    }
  }

  async getObject(key: string): Promise<GetObjectResult> {
    assertValidStorageKey(key);
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      const computedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const expectedSha256 = response.Metadata?.['sha256-checksum'];

      if (expectedSha256 && expectedSha256.toLowerCase().trim() !== computedSha256.toLowerCase()) {
        throw new StorageIntegrityError(
          `Object integrity check failed for "${key}": checksum mismatch.`
        );
      }

      return {
        buffer,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength ?? buffer.length,
        sha256: computedSha256,
        lastModified: response.LastModified,
      };
    } catch (error: any) {
      this.handleS3Error(error, key);
    }
  }

  async openReadStream(key: string): Promise<OpenReadStreamResult> {
    assertValidStorageKey(key);
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
        sha256: response.Metadata?.['sha256-checksum'],
        lastModified: response.LastModified,
      };
    } catch (error: any) {
      this.handleS3Error(error, key);
    }
  }

  async createPresignedDownloadUrl(params: {
    key: string;
    expiresInSeconds?: number;
    fileName?: string;
    contentType?: string;
  }): Promise<string> {
    assertValidStorageKey(params.key);
    const expiresIn = params.expiresInSeconds || this.defaultPresignedUrlExpires;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ...(params.fileName
        ? { ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(params.fileName)}` }
        : {}),
      ...(params.contentType
        ? { ResponseContentType: params.contentType }
        : {}),
    });

    try {
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error: any) {
      this.handleS3Error(error, params.key);
    }
  }

  async deleteObject(key: string): Promise<void> {
    assertValidStorageKey(key);
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error: any) {
      this.handleS3Error(error, key);
    }
  }

  async objectExists(key: string): Promise<boolean> {
    assertValidStorageKey(key);
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      const name = error?.name;
      const statusCode = error?.$metadata?.httpStatusCode;
      if (name === 'NotFound' || name === 'NoSuchKey' || statusCode === 404) {
        return false;
      }
      this.handleS3Error(error, key);
    }
  }

  private handleS3Error(error: any, key: string): never {
    if (error instanceof StorageError) {
      throw error;
    }

    const name = error?.name;
    const statusCode = error?.$metadata?.httpStatusCode;

    if (name === 'NoSuchKey' || name === 'NotFound' || statusCode === 404) {
      throw new StorageObjectNotFoundError(key);
    }
    if (name === 'AccessDenied' || statusCode === 403) {
      throw new StorageAccessDeniedError(
        `S3 access denied for key "${key}" on bucket "${this.bucket}". Verify IAM permissions.`
      );
    }

    throw new StorageError(
      error?.message || `S3 storage operation failed for key "${key}"`,
      name || 'S3_OPERATION_FAILED',
      statusCode || 500
    );
  }
}
