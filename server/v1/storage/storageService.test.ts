import { rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import {
  assertValidStorageKey,
  StorageKeyInvalidError,
  StorageObjectNotFoundError,
  StorageAccessDeniedError,
  StorageIntegrityError,
  getStorageService,
  resetStorageService,
} from './storageService.js';
import { LocalStorageProvider } from './localStorageProvider.js';
import { S3StorageProvider } from './s3StorageProvider.js';
import { getStorageConfig } from './storageConfig.js';
import express from 'express';
import request from 'supertest';
import { createV1Router } from '../api.js';

describe('Storage Abstraction & Providers', () => {
  const testStorageDir = path.resolve('.codex-tmp/test-storage-' + crypto.randomUUID());
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    s3Mock.reset();
    resetStorageService();
  });

  afterAll(async () => {
    await rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Key Validation & Path Security', () => {
    it('accepts valid nested storage keys', () => {
      expect(() => assertValidStorageKey('company-123/receipts/doc-1.pdf')).not.toThrow();
      expect(() => assertValidStorageKey('tenant_a/employees/emp-99/avatar.png')).not.toThrow();
      expect(() => assertValidStorageKey('c-1/onboarding/file.docx')).not.toThrow();
    });

    it('rejects path traversal and directory escape attempts', () => {
      expect(() => assertValidStorageKey('../../etc/passwd')).toThrow(StorageKeyInvalidError);
      expect(() => assertValidStorageKey('company-1/../../company-2/file.pdf')).toThrow(StorageKeyInvalidError);
      expect(() => assertValidStorageKey('../file.pdf')).toThrow(StorageKeyInvalidError);
      expect(() => assertValidStorageKey('company-1/..')).toThrow(StorageKeyInvalidError);
    });

    it('rejects invalid characters, null bytes, and empty keys', () => {
      expect(() => assertValidStorageKey('')).toThrow(StorageKeyInvalidError);
      expect(() => assertValidStorageKey('   ')).toThrow(StorageKeyInvalidError);
      expect(() => assertValidStorageKey('/absolute/path.pdf')).toThrow(StorageKeyInvalidError);
      expect(() => assertValidStorageKey('\\windows\\path.pdf')).toThrow(StorageKeyInvalidError);
      expect(() => assertValidStorageKey('company/file\0.pdf')).toThrow(StorageKeyInvalidError);
    });
  });

  describe('LocalStorageProvider', () => {
    const local = new LocalStorageProvider(testStorageDir);

    it('puts, gets, and verifies file integrity with SHA-256', async () => {
      const key = 'tenant-1/receipts/test-doc.pdf';
      const content = Buffer.from('OrbitHR Document Content For Testing 12345');
      const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex');

      const putResult = await local.putObject({
        key,
        buffer: content,
        contentType: 'application/pdf',
      });

      expect(putResult.key).toBe(key);
      expect(putResult.sizeBytes).toBe(content.length);
      expect(putResult.sha256).toBe(expectedSha256);

      const exists = await local.objectExists(key);
      expect(exists).toBe(true);

      const getResult = await local.getObject(key);
      expect(getResult.buffer.equals(content)).toBe(true);
      expect(getResult.contentLength).toBe(content.length);
      expect(getResult.contentType).toBe('application/pdf');
      expect(getResult.sha256).toBe(expectedSha256);
    });

    it('streams stored object contents accurately', async () => {
      const key = 'tenant-1/receipts/stream-test.png';
      const content = Buffer.from('Binary image test chunk 987654321');
      await local.putObject({ key, buffer: content, contentType: 'image/png' });

      const streamResult = await local.openReadStream(key);
      expect(streamResult.contentType).toBe('image/png');
      expect(streamResult.contentLength).toBe(content.length);

      const chunks: Buffer[] = [];
      for await (const chunk of streamResult.stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).equals(content)).toBe(true);
    });

    it('deletes stored objects and fails closed on nonexistent keys', async () => {
      const key = 'tenant-1/receipts/delete-me.pdf';
      await local.putObject({ key, buffer: Buffer.from('to be deleted'), contentType: 'application/pdf' });

      await local.deleteObject(key);
      const exists = await local.objectExists(key);
      expect(exists).toBe(false);

      await expect(local.getObject(key)).rejects.toThrow(StorageObjectNotFoundError);
      await expect(local.openReadStream(key)).rejects.toThrow(StorageObjectNotFoundError);

      // Idempotent delete does not throw
      await expect(local.deleteObject(key)).resolves.not.toThrow();
    });

    it('creates local signed download URL with expiry and signature', async () => {
      const key = 'tenant-1/receipts/presigned.pdf';
      const url = await local.createPresignedDownloadUrl({
        key,
        expiresInSeconds: 300,
        fileName: 'my-receipt.pdf',
      });

      expect(url).toContain('/api/v1/storage/download?');
      expect(url).toContain('key=' + encodeURIComponent(key));
      expect(url).toContain('sig=');
      expect(url).toContain('expires=');
      expect(url).toContain('fileName=my-receipt.pdf');
    });
  });

  describe('S3StorageProvider', () => {
    const s3Config = {
      provider: 's3' as const,
      storageRoot: testStorageDir,
      s3: {
        region: 'ap-south-1',
        bucketName: 'test-bucket-orbithr',
        presignedUrlExpiresSeconds: 900,
      },
    };

    const s3Provider = new S3StorageProvider(s3Config, new S3Client({ region: 'ap-south-1' }));

    it('puts object with SSE-S3 encryption and SHA-256 metadata', async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const content = Buffer.from('S3 Cloud Document Test');
      const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex');
      const key = 'tenant-cloud/receipts/rec-01.pdf';

      const result = await s3Provider.putObject({
        key,
        buffer: content,
        contentType: 'application/pdf',
      });

      expect(result.key).toBe(key);
      expect(result.sha256).toBe(expectedSha256);
      expect(result.sizeBytes).toBe(content.length);

      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input).toMatchObject({
        Bucket: 'test-bucket-orbithr',
        Key: key,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256',
        Metadata: {
          'sha256-checksum': expectedSha256,
        },
      });
    });

    it('gets object and verifies buffer and metadata', async () => {
      const content = Buffer.from('Simulated S3 Body Content');
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');

      const { Readable } = await import('node:stream');
      const stream = Readable.from([content]);

      s3Mock.on(GetObjectCommand).resolves({
        Body: stream as any,
        ContentType: 'application/pdf',
        ContentLength: content.length,
        Metadata: { 'sha256-checksum': sha256 },
        LastModified: new Date('2026-10-01T00:00:00Z'),
      });

      const result = await s3Provider.getObject('tenant-cloud/receipts/rec-01.pdf');
      expect(result.buffer.equals(content)).toBe(true);
      expect(result.contentType).toBe('application/pdf');
      expect(result.sha256).toBe(sha256);
    });

    it('checks objectExists using HeadObjectCommand', async () => {
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 1024,
      });

      const exists = await s3Provider.objectExists('tenant-cloud/receipts/rec-01.pdf');
      expect(exists).toBe(true);

      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      (notFoundError as any).$metadata = { httpStatusCode: 404 };
      s3Mock.on(HeadObjectCommand).rejects(notFoundError);

      const existsNotFound = await s3Provider.objectExists('tenant-cloud/receipts/missing.pdf');
      expect(existsNotFound).toBe(false);
    });

    it('maps 404 and 403 S3 errors to typed domain errors', async () => {
      const notFoundError = new Error('NoSuchKey');
      notFoundError.name = 'NoSuchKey';
      (notFoundError as any).$metadata = { httpStatusCode: 404 };
      s3Mock.on(GetObjectCommand).rejects(notFoundError);

      await expect(s3Provider.getObject('tenant/missing.pdf')).rejects.toThrow(StorageObjectNotFoundError);

      const accessDenied = new Error('Access Denied');
      accessDenied.name = 'AccessDenied';
      (accessDenied as any).$metadata = { httpStatusCode: 403 };
      s3Mock.on(GetObjectCommand).rejects(accessDenied);

      await expect(s3Provider.getObject('tenant/forbidden.pdf')).rejects.toThrow(StorageAccessDeniedError);
    });

    it('deletes object using DeleteObjectCommand', async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});

      await expect(s3Provider.deleteObject('tenant-cloud/receipts/rec-01.pdf')).resolves.not.toThrow();
      expect(s3Mock.commandCalls(DeleteObjectCommand).length).toBe(1);
    });

    it('verifies SHA-256 integrity on getObject and throws StorageIntegrityError on mismatch', async () => {
      const { Readable } = await import('node:stream');
      const validBuffer = Buffer.from('Legitimate untampered content');
      const validHash = crypto.createHash('sha256').update(validBuffer).digest('hex');

      // 1. Valid matching checksum
      s3Mock.on(GetObjectCommand, { Key: 'tenant/legit.txt' }).resolves({
        Body: Readable.from([validBuffer]) as any,
        ContentType: 'text/plain',
        ContentLength: validBuffer.length,
        Metadata: { 'sha256-checksum': validHash },
      });
      const validResult = await s3Provider.getObject('tenant/legit.txt');
      expect(validResult.sha256).toBe(validHash);
      expect(validResult.buffer.equals(validBuffer)).toBe(true);

      // 2. Mismatched/corrupted checksum throws StorageIntegrityError
      s3Mock.on(GetObjectCommand, { Key: 'tenant/tampered.txt' }).resolves({
        Body: Readable.from([Buffer.from('Corrupted or tampered content')]) as any,
        ContentType: 'text/plain',
        ContentLength: 29,
        Metadata: { 'sha256-checksum': validHash },
      });
      await expect(s3Provider.getObject('tenant/tampered.txt')).rejects.toThrow(StorageIntegrityError);

      // 3. Legacy object without metadata checksum succeeds and computes hash
      s3Mock.on(GetObjectCommand, { Key: 'tenant/legacy.txt' }).resolves({
        Body: Readable.from([validBuffer]) as any,
        ContentType: 'text/plain',
        ContentLength: validBuffer.length,
        Metadata: {},
      });
      const legacyResult = await s3Provider.getObject('tenant/legacy.txt');
      expect(legacyResult.sha256).toBe(validHash);

      // 4. Empty object is handled correctly
      const emptyBuffer = Buffer.alloc(0);
      const emptyHash = crypto.createHash('sha256').update(emptyBuffer).digest('hex');
      s3Mock.on(GetObjectCommand, { Key: 'tenant/empty.txt' }).resolves({
        Body: Readable.from([emptyBuffer]) as any,
        ContentType: 'text/plain',
        ContentLength: 0,
        Metadata: { 'sha256-checksum': emptyHash },
      });
      const emptyResult = await s3Provider.getObject('tenant/empty.txt');
      expect(emptyResult.sha256).toBe(emptyHash);
      expect(emptyResult.buffer.length).toBe(0);
    });
  });

  describe('Configuration & Fail-Closed Provider Selection', () => {
    it('defaults to local provider when STORAGE_PROVIDER is unset in development', () => {
      const prevProvider = process.env.STORAGE_PROVIDER;
      const prevNodeEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';
        delete process.env.STORAGE_PROVIDER;
        const config = getStorageConfig();
        expect(config.provider).toBe('local');

        const service = getStorageService(config);
        expect(service.providerName).toBe('local');
      } finally {
        if (prevProvider) process.env.STORAGE_PROVIDER = prevProvider;
        else delete process.env.STORAGE_PROVIDER;
        if (prevNodeEnv) process.env.NODE_ENV = prevNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });

    it('enforces STORAGE_PROVIDER=s3 in production and rejects local or missing provider', () => {
      const prevProvider = process.env.STORAGE_PROVIDER;
      const prevNodeEnv = process.env.NODE_ENV;
      const prevBucket = process.env.S3_BUCKET_NAME;
      const prevRegion = process.env.AWS_REGION;
      try {
        process.env.NODE_ENV = 'production';

        // 1. Missing provider in production fails
        delete process.env.STORAGE_PROVIDER;
        expect(() => getStorageConfig()).toThrow(/STORAGE_PROVIDER environment variable is required in production/);

        // 2. Explicit local provider in production fails
        process.env.STORAGE_PROVIDER = 'local';
        expect(() => getStorageConfig()).toThrow(/Only "s3" is permitted in production/);

        // 3. Typo/invalid provider in production fails
        process.env.STORAGE_PROVIDER = 's3-bucket';
        expect(() => getStorageConfig()).toThrow(/Only "s3" is permitted in production/);

        // 4. Valid s3 provider in production succeeds when required fields are present
        process.env.STORAGE_PROVIDER = 's3';
        process.env.S3_BUCKET_NAME = 'prod-bucket';
        process.env.AWS_REGION = 'ap-south-1';
        const config = getStorageConfig();
        expect(config.provider).toBe('s3');
        expect(config.s3.bucketName).toBe('prod-bucket');
      } finally {
        if (prevProvider) process.env.STORAGE_PROVIDER = prevProvider;
        else delete process.env.STORAGE_PROVIDER;
        if (prevNodeEnv) process.env.NODE_ENV = prevNodeEnv;
        else delete process.env.NODE_ENV;
        if (prevBucket) process.env.S3_BUCKET_NAME = prevBucket;
        else delete process.env.S3_BUCKET_NAME;
        if (prevRegion) process.env.AWS_REGION = prevRegion;
        else delete process.env.AWS_REGION;
      }
    });

    it('rejects unsupported provider values in non-production environments', () => {
      const prevProvider = process.env.STORAGE_PROVIDER;
      const prevNodeEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';
        process.env.STORAGE_PROVIDER = 'gcs';
        expect(() => getStorageConfig()).toThrow(/Unsupported STORAGE_PROVIDER "gcs"/);
      } finally {
        if (prevProvider) process.env.STORAGE_PROVIDER = prevProvider;
        else delete process.env.STORAGE_PROVIDER;
        if (prevNodeEnv) process.env.NODE_ENV = prevNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });

    it('fails closed when STORAGE_PROVIDER=s3 but bucket name is missing', () => {
      const prevProvider = process.env.STORAGE_PROVIDER;
      const prevBucket = process.env.S3_BUCKET_NAME;
      try {
        process.env.STORAGE_PROVIDER = 's3';
        delete process.env.S3_BUCKET_NAME;
        expect(() => getStorageConfig()).toThrow(/S3_BUCKET_NAME is required/);
      } finally {
        if (prevProvider) process.env.STORAGE_PROVIDER = prevProvider;
        else delete process.env.STORAGE_PROVIDER;
        if (prevBucket) process.env.S3_BUCKET_NAME = prevBucket;
      }
    });
  });

  describe('Local Presigned Download Route (/api/v1/storage/download)', () => {
    it('serves file with 200 on valid signature and rejects forged, expired, or malformed requests', async () => {
      const prevStorageDir = process.env.DOCUMENT_STORAGE_DIR;
      const prevSecret = process.env.JWT_ACCESS_SECRET;
      process.env.DOCUMENT_STORAGE_DIR = testStorageDir;
      process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);

      const local = new LocalStorageProvider(testStorageDir);
      const testKey = 'tenant-test/docs/doc-presign.txt';
      const fileContent = Buffer.from('Signed URL Test Content 55555');
      await local.putObject({ key: testKey, buffer: fileContent, contentType: 'text/plain' });

      const app = express();
      const prismaMock: any = {};
      app.use('/api/v1', createV1Router(prismaMock));

      try {
        // 1. Valid signature succeeds end to end
        const validUrl = await local.createPresignedDownloadUrl({
          key: testKey,
          expiresInSeconds: 300,
          fileName: 'doc-presign.txt',
          contentType: 'text/plain',
        });
        const resValid = await request(app).get(validUrl);
        expect(resValid.status).toBe(200);
        expect(resValid.text).toBe('Signed URL Test Content 55555');
        expect(resValid.header['content-type']).toContain('text/plain');
        expect(resValid.header['content-disposition']).toContain('doc-presign.txt');

        // 2. Forged signature is rejected with 403
        const forgedUrl = validUrl.replace(/sig=[a-f0-9]{64}/, 'sig=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        const resForged = await request(app).get(forgedUrl);
        expect(resForged.status).toBe(403);
        expect(resForged.body.error.code).toBe('PRESIGNED_URL_SIGNATURE_INVALID');

        // 3. Expired timestamp is rejected with 403
        const expiredTimestamp = Math.floor(Date.now() / 1000) - 100;
        const expiredSig = crypto
          .createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
          .update(`${testKey}:${expiredTimestamp}`)
          .digest('hex');
        const expiredUrl = `/api/v1/storage/download?key=${encodeURIComponent(testKey)}&expires=${expiredTimestamp}&sig=${expiredSig}`;
        const resExpired = await request(app).get(expiredUrl);
        expect(resExpired.status).toBe(403);
        expect(resExpired.body.error.code).toBe('PRESIGNED_URL_EXPIRED');

        // 4. Path traversal attempt is rejected with 400
        const traversalKey = 'tenant/../../etc/passwd';
        const traversalSig = crypto
          .createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
          .update(`${traversalKey}:${Math.floor(Date.now() / 1000) + 300}`)
          .digest('hex');
        const resTraversal = await request(app).get(
          `/api/v1/storage/download?key=${encodeURIComponent(traversalKey)}&expires=${Math.floor(Date.now() / 1000) + 300}&sig=${traversalSig}`
        );
        expect(resTraversal.status).toBe(400);
        expect(resTraversal.body.error.code).toBe('STORAGE_KEY_INVALID');
      } finally {
        if (prevStorageDir) process.env.DOCUMENT_STORAGE_DIR = prevStorageDir;
        else delete process.env.DOCUMENT_STORAGE_DIR;
        if (prevSecret) process.env.JWT_ACCESS_SECRET = prevSecret;
        else delete process.env.JWT_ACCESS_SECRET;
      }
    });
  });
});

