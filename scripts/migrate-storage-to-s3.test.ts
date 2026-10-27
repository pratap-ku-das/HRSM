import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { runStorageMigration } from './migrate-storage-to-s3.js';
import { S3StorageProvider } from '../server/v1/storage/s3StorageProvider.js';

describe('Local to S3 Migration Utility', () => {
  const testRoot = path.resolve('.codex-tmp/mig-test-' + crypto.randomUUID());
  const s3Mock = mockClient(S3Client);

  const sampleBuffer = Buffer.from('OrbitHR Migration Test Payload 9999');
  const sampleHash = crypto.createHash('sha256').update(sampleBuffer).digest('hex');

  beforeEach(() => {
    s3Mock.reset();
  });

  afterAll(async () => {
    await rm(testRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('runs inventory in dry-run mode and detects matched, missing, and orphaned files', async () => {
    const receiptsDir = path.join(testRoot, 'receipts', 'company-100');
    await mkdir(receiptsDir, { recursive: true });

    // File 1: Legitimate receipt matching a DB record
    const file1Name = 'receipt-1.pdf';
    await writeFile(path.join(receiptsDir, file1Name), sampleBuffer);

    // File 2: Orphaned file on disk not in DB
    const orphanName = 'orphan-file.pdf';
    await writeFile(path.join(receiptsDir, orphanName), Buffer.from('orphan content'));

    const prismaMock: any = {
      employeeDocument: {
        findMany: vi.fn().mockResolvedValue([
          // Matched record
          {
            id: 'doc-1',
            companyId: 'company-100',
            documentType: 'EXPENSE_RECEIPT',
            objectKey: `company-100/${file1Name}`,
            sizeBytes: sampleBuffer.length,
            fileName: 'receipt-1.pdf',
            mimeType: 'application/pdf',
          },
          // Missing record (in DB but not on disk)
          {
            id: 'doc-2-missing',
            companyId: 'company-100',
            documentType: 'EXPENSE_RECEIPT',
            objectKey: `company-100/missing-file.pdf`,
            sizeBytes: 1234,
            fileName: 'missing-file.pdf',
            mimeType: 'application/pdf',
          },
        ]),
      },
      companyDocument: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const report = await runStorageMigration(prismaMock, {
      mode: 'dry-run',
      storageRoot: testRoot,
    });

    expect(report.mode).toBe('dry-run');
    expect(report.summary.totalScannedFiles).toBe(2);
    expect(report.summary.matchedDbRecords).toBe(1);
    expect(report.summary.missingSourceFiles).toBe(1);
    expect(report.summary.orphanedFiles).toBe(1);

    const matchedItem = report.items.find((i) => i.id === 'doc-1');
    expect(matchedItem).toBeDefined();
    expect(matchedItem?.sha256).toBe(sampleHash);
    expect(matchedItem?.status).toBe('PENDING');

    const missingItem = report.items.find((i) => i.id === 'doc-2-missing');
    expect(missingItem).toBeDefined();
    expect(missingItem?.status).toBe('MISSING_SOURCE');

    expect(report.orphans.length).toBe(1);
    expect(report.orphans[0].path).toContain('orphan-file.pdf');
    expect(report.orphans[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    // Asserts no S3 calls were made in dry-run mode
    expect(s3Mock.commandCalls(PutObjectCommand).length).toBe(0);
  });

  it('fails closed and strictly blocks execute mode in production and staging environments', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prismaMock: any = {};

    try {
      // Production is blocked
      process.env.NODE_ENV = 'production';
      await expect(
        runStorageMigration(prismaMock, { mode: 'execute', storageRoot: testRoot })
      ).rejects.toThrow(/Safety Violation: S3 migration execution \(--execute\) is strictly disabled in "production"/);

      // Staging is blocked
      process.env.NODE_ENV = 'staging';
      await expect(
        runStorageMigration(prismaMock, { mode: 'execute', storageRoot: testRoot })
      ).rejects.toThrow(/Safety Violation: S3 migration execution \(--execute\) is strictly disabled in "staging"/);

      // Missing or unrecognized environment is blocked fail-closed
      process.env.NODE_ENV = 'qa';
      await expect(
        runStorageMigration(prismaMock, { mode: 'execute', storageRoot: testRoot })
      ).rejects.toThrow(/Safety Violation: S3 migration execution \(--execute\) is strictly disabled in "qa"/);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('executes upload and verifies destination checksum in execute mode', async () => {
    const docsDir = path.join(testRoot, 'company-documents', 'tenant-200');
    await mkdir(docsDir, { recursive: true });

    const fileName = 'handbook.pdf';
    await writeFile(path.join(docsDir, fileName), sampleBuffer);

    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: sampleBuffer.length });

    const { Readable } = await import('node:stream');
    s3Mock.on(GetObjectCommand).resolves({
      Body: Readable.from([sampleBuffer]) as any,
      ContentLength: sampleBuffer.length,
      ContentType: 'application/pdf',
      Metadata: { 'sha256-checksum': sampleHash },
    });

    const s3Provider = new S3StorageProvider(
      {
        provider: 's3',
        storageRoot: testRoot,
        s3: {
          region: 'ap-south-1',
          bucketName: 'orbithr-migration-test-bucket',
          presignedUrlExpiresSeconds: 900,
        },
      },
      new S3Client({ region: 'ap-south-1' })
    );

    const prismaMock: any = {
      employeeDocument: { findMany: vi.fn().mockResolvedValue([]) },
      companyDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'comp-doc-1',
            companyId: 'tenant-200',
            category: 'POLICIES',
            objectKey: `tenant-200/${fileName}`,
            sizeBytes: sampleBuffer.length,
            fileName,
            mimeType: 'application/pdf',
          },
        ]),
      },
    };

    const report = await runStorageMigration(
      prismaMock,
      {
        mode: 'execute',
        storageRoot: testRoot,
      },
      s3Provider
    );

    expect(report.summary.successfulMigrations).toBe(1);
    expect(report.summary.failedMigrations).toBe(0);

    const migratedItem = report.items.find((i) => i.id === 'comp-doc-1');
    expect(migratedItem?.status).toBe('VERIFIED');

    // Verify S3 received the exact bytes and metadata
    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input.Key).toBe(`tenant-200/${fileName}`);

    // Verify local source file is STILL on disk (never deleted)
    const fs = await import('node:fs');
    expect(fs.existsSync(path.join(docsDir, fileName))).toBe(true);
  });
});
