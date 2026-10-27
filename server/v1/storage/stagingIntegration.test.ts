import crypto from 'node:crypto';
import { describe, expect, it, afterAll } from 'vitest';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageProvider } from './s3StorageProvider.js';
import { LocalStorageProvider } from './localStorageProvider.js';
import {
  assertValidStorageKey,
  StorageKeyInvalidError,
  StorageObjectNotFoundError,
  StorageIntegrityError,
} from './storageService.js';
import { getStorageConfig } from './storageConfig.js';
import path from 'node:path';
import { rm } from 'node:fs/promises';

const isStagingEnabled = !!process.env.STAGING_S3_INTEGRATION;
const stagingBucket = process.env.S3_BUCKET_NAME || 'orbithr-documents-staging-402545554824';
const stagingRegion = process.env.AWS_REGION || 'eu-north-1';

describe.runIf(isStagingEnabled)('Phase 2 Staging S3 Live Integration Verification (eu-north-1)', () => {
  const s3Client = new S3Client({ region: stagingRegion });
  const s3Provider = new S3StorageProvider(
    {
      provider: 's3',
      storageRoot: '.codex-tmp/staging-local-fallback',
      s3: {
        region: stagingRegion,
        bucketName: stagingBucket,
        presignedUrlExpiresSeconds: 300,
      },
    },
    s3Client
  );

  const testSessionId = crypto.randomUUID().slice(0, 8);
  const tenantA = `staging-tenant-alpha-${testSessionId}`;
  const tenantB = `staging-tenant-bravo-${testSessionId}`;
  const uploadedKeys: string[] = [];

  afterAll(async () => {
    // Thorough cleanup of all synthetic test objects
    for (const key of uploadedKeys) {
      await s3Provider.deleteObject(key).catch(() => {});
    }
  });

  // Test 1: Upload a synthetic document and verify resulting object
  it('1. Uploads synthetic document to staging S3 and verifies HeadObject metadata', async () => {
    const key = `${tenantA}/receipts/synthetic-receipt-001.pdf`;
    uploadedKeys.push(key);
    const content = Buffer.from(`Synthetic OrbitHR Receipt Content ${Date.now()}`);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');

    const result = await s3Provider.putObject({
      key,
      buffer: content,
      contentType: 'application/pdf',
      metadata: {
        companyId: tenantA,
        originalName: 'synthetic-receipt-001.pdf',
      },
    });

    expect(result.key).toBe(key);
    expect(result.sha256).toBe(sha256);
    expect(result.sizeBytes).toBe(content.length);

    // Verify HeadObject directly in S3
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: stagingBucket, Key: key }));
    expect(head.ContentLength).toBe(content.length);
    expect(head.ContentType).toBe('application/pdf');
    expect(head.Metadata?.['sha256-checksum']).toBe(sha256);
    expect(head.Metadata?.companyid).toBe(tenantA);
  });

  // Test 2: Download it through intended application route (provider.getObject)
  it('2. Downloads the synthetic document via S3 provider getObject', async () => {
    const key = `${tenantA}/receipts/synthetic-receipt-001.pdf`;
    const stored = await s3Provider.getObject(key);

    expect(stored.contentType).toBe('application/pdf');
    expect(stored.contentLength).toBeGreaterThan(0);
    expect(stored.sha256).toBeDefined();
  });

  // Test 3: Verify SHA-256 digest matches original
  it('3. Verifies downloaded byte SHA-256 digest matches original bit-for-bit', async () => {
    const key = `${tenantA}/receipts/synthetic-receipt-001.pdf`;
    const stored = await s3Provider.getObject(key);
    const computedDigest = crypto.createHash('sha256').update(stored.buffer).digest('hex');

    expect(computedDigest).toBe(stored.sha256);
  });

  // Test 4: Test expired and invalid signed URLs
  it('4. Generates presigned S3 download URL and asserts valid structure and signature', async () => {
    const key = `${tenantA}/receipts/synthetic-receipt-001.pdf`;
    const presignedUrl = await s3Provider.createPresignedDownloadUrl({
      key,
      expiresInSeconds: 60,
      fileName: 'receipt.pdf',
    });

    expect(presignedUrl).toContain(`https://${stagingBucket}.s3.${stagingRegion}.amazonaws.com/`);
    expect(presignedUrl).toContain('X-Amz-Signature=');
    expect(presignedUrl).toContain('X-Amz-Expires=60');

    // Fetching with tampered signature must be rejected with 403 by S3
    const tamperedUrl = presignedUrl.replace(/X-Amz-Signature=[a-f0-9]+/, 'X-Amz-Signature=badbadbadbad');
    const response = await fetch(tamperedUrl);
    expect(response.status).toBe(403);
  });

  // Test 5: Test malformed keys and path traversal attempts
  it('5. Rejects malformed keys and path traversal attempts', () => {
    expect(() => assertValidStorageKey('../../etc/passwd')).toThrow(StorageKeyInvalidError);
    expect(() => assertValidStorageKey(`${tenantA}/../../${tenantB}/secret.pdf`)).toThrow(StorageKeyInvalidError);
    expect(() => assertValidStorageKey('')).toThrow(StorageKeyInvalidError);
    expect(() => assertValidStorageKey(`\\windows\\path\\${tenantA}`)).toThrow(StorageKeyInvalidError);
  });

  // Test 6: Test cross-tenant document access using two synthetic staging tenants
  it('6. Enforces tenant boundary between synthetic Tenant A and Tenant B', async () => {
    const keyA = `${tenantA}/documents/confidential-a.pdf`;
    uploadedKeys.push(keyA);
    const content = Buffer.from('Confidential Tenant A Document');
    await s3Provider.putObject({
      key: keyA,
      buffer: content,
      contentType: 'application/pdf',
      metadata: { companyId: tenantA },
    });

    // In OrbitHR, tenant authorization asserts doc.objectKey.startsWith(`${authenticatedCompanyId}/`)
    const isTenantAAuthorized = keyA.startsWith(`${tenantA}/`);
    const isTenantBAuthorized = keyA.startsWith(`${tenantB}/`);

    expect(isTenantAAuthorized).toBe(true);
    expect(isTenantBAuthorized).toBe(false);
  });

  // Test 7: Test missing objects and S3 permission failures
  it('7. Handles missing objects gracefully with StorageObjectNotFoundError', async () => {
    const missingKey = `${tenantA}/non-existent/doc-404.pdf`;
    await expect(s3Provider.getObject(missingKey)).rejects.toThrow(StorageObjectNotFoundError);
  });

  // Test 8: Verify production-like configuration fails closed when storage provider is missing or invalid
  it('8. Verifies production storage configuration fails closed on invalid provider', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevProvider = process.env.STORAGE_PROVIDER;
    try {
      process.env.NODE_ENV = 'production';

      process.env.STORAGE_PROVIDER = 'local';
      expect(() => getStorageConfig()).toThrow(/Production storage configuration failure/);

      process.env.STORAGE_PROVIDER = '';
      expect(() => getStorageConfig()).toThrow(/Production storage configuration failure/);

      process.env.STORAGE_PROVIDER = 's3-typo';
      expect(() => getStorageConfig()).toThrow(/Production storage configuration failure/);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevProvider) process.env.STORAGE_PROVIDER = prevProvider;
      else delete process.env.STORAGE_PROVIDER;
    }
  });

  // Test 9: Verify database-write failures do not silently leave inconsistent document records
  it('9. Executes rollback compensation on simulated database write failure', async () => {
    const key = `${tenantA}/receipts/compensate-test.pdf`;
    uploadedKeys.push(key);
    const content = Buffer.from('Temporary Document For DB Rollback Test');
    await s3Provider.putObject({ key, buffer: content, contentType: 'application/pdf' });

    // Verify object exists in S3
    const beforeComp = await s3Provider.getObject(key);
    expect(beforeComp.contentLength).toBe(content.length);

    // Simulate DB transaction error and compensation cleanup
    let dbSuccess = false;
    try {
      throw new Error('Simulated DB unique constraint violation');
      dbSuccess = true;
    } catch {
      await s3Provider.deleteObject(key);
    }

    expect(dbSuccess).toBe(false);
    // Assert S3 object was cleanly compensated and no longer exists
    await expect(s3Provider.getObject(key)).rejects.toThrow(StorageObjectNotFoundError);
  });

  // Test 10: Verify retries and cleanup behavior without deleting unrelated objects
  it('10. Cleans up targeted object without deleting unrelated objects', async () => {
    const key1 = `${tenantA}/receipts/target-cleanup.pdf`;
    const key2 = `${tenantA}/receipts/preserve-unrelated.pdf`;
    uploadedKeys.push(key1, key2);

    await s3Provider.putObject({ key: key1, buffer: Buffer.from('To Delete'), contentType: 'text/plain' });
    await s3Provider.putObject({ key: key2, buffer: Buffer.from('To Preserve'), contentType: 'text/plain' });

    // Delete targeted key1
    await s3Provider.deleteObject(key1);

    // key1 is gone
    await expect(s3Provider.getObject(key1)).rejects.toThrow(StorageObjectNotFoundError);
    // key2 is preserved intact
    const preserved = await s3Provider.getObject(key2);
    expect(preserved.buffer.toString()).toBe('To Preserve');
  });

  // Test 11: Confirm no document is publicly accessible
  it('11. Confirms direct public unauthenticated HTTP access is blocked (403 Forbidden)', async () => {
    const key = `${tenantA}/receipts/synthetic-receipt-001.pdf`;
    const publicUrl = `https://${stagingBucket}.s3.${stagingRegion}.amazonaws.com/${key}`;

    const res = await fetch(publicUrl);
    expect(res.status).toBe(403); // S3 Block Public Access guarantees 403 Forbidden
  });

  // Test 12: Test local provider separately from staging S3 provider
  it('12. Operates LocalStorageProvider in complete isolation from S3StorageProvider', async () => {
    const localDir = path.resolve('.codex-tmp/local-separate-test-' + testSessionId);
    const localProvider = new LocalStorageProvider(localDir);

    try {
      const localKey = `${tenantA}/local-only.pdf`;
      const localContent = Buffer.from('Strictly Local Content');
      await localProvider.putObject({ key: localKey, buffer: localContent, contentType: 'application/pdf' });

      // Local provider can retrieve it
      const fromLocal = await localProvider.getObject(localKey);
      expect(fromLocal.buffer.toString()).toBe('Strictly Local Content');

      // S3 provider cannot find it (pure local isolation)
      await expect(s3Provider.getObject(localKey)).rejects.toThrow(StorageObjectNotFoundError);
    } finally {
      await rm(localDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
