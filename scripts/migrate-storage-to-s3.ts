import fs from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getStorageConfig } from '../server/v1/storage/storageConfig.js';
import { S3StorageProvider } from '../server/v1/storage/s3StorageProvider.js';

export interface MigrationOptions {
  mode: 'dry-run' | 'execute' | 'verify' | 'report';
  storageRoot?: string;
  reportPath?: string;
  concurrency?: number;
}

export interface DocumentMigrationItem {
  id: string;
  category: 'EXPENSE_RECEIPT' | 'EMPLOYEE_DOCUMENT' | 'COMPANY_DOCUMENT';
  companyId: string;
  localRelativePath: string;
  localAbsolutePath: string;
  objectKey: string;
  sizeBytes: number;
  sha256: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'MISSING_SOURCE' | 'ORPHAN_ON_DISK';
  error?: string;
}

export interface MigrationReport {
  timestamp: string;
  mode: string;
  environment: string;
  storageRoot: string;
  targetBucket?: string;
  summary: {
    totalScannedFiles: number;
    matchedDbRecords: number;
    orphanedFiles: number;
    missingSourceFiles: number;
    successfulMigrations: number;
    failedMigrations: number;
  };
  items: DocumentMigrationItem[];
  orphans: Array<{ path: string; sizeBytes: number; sha256: string }>;
}

export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function runStorageMigration(
  prisma: PrismaClient,
  options: MigrationOptions,
  s3ProviderOverride?: S3StorageProvider
): Promise<MigrationReport> {
  const mode = options.mode || 'dry-run';
  const rawEnv = process.env.NODE_ENV;
  const nodeEnv = (rawEnv || '').toLowerCase().trim();
  const isSafeLocalOrTest = nodeEnv === 'development' || nodeEnv === 'test';

  // Safety Gate: Fail-closed environment protection for migration execution
  if (mode === 'execute') {
    if (!isSafeLocalOrTest || nodeEnv === 'production' || nodeEnv === 'staging') {
      throw new Error(
        `Safety Violation: S3 migration execution (--execute) is strictly disabled in "${nodeEnv || 'unspecified'}" environment. ` +
        `Direct migration execution is restricted to authorized offline/development tooling only.`
      );
    }
  }

  const storageRoot = path.resolve(options.storageRoot || process.env.DOCUMENT_STORAGE_DIR || 'storage');
  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    mode,
    environment: nodeEnv,
    storageRoot,
    summary: {
      totalScannedFiles: 0,
      matchedDbRecords: 0,
      orphanedFiles: 0,
      missingSourceFiles: 0,
      successfulMigrations: 0,
      failedMigrations: 0,
    },
    items: [],
    orphans: [],
  };

  // 1. Scan Local Storage Directories
  const scannedDiskFiles = new Map<string, { size: number; sha256: string }>();

  async function walkDir(dir: string, relativeDir = ''): Promise<void> {
    if (!fs.existsSync(dir)) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walkDir(fullPath, relPath);
      } else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
        const fileStat = await stat(fullPath);
        const sha256 = await computeFileHash(fullPath);
        scannedDiskFiles.set(relPath.replace(/\\/g, '/'), { size: fileStat.size, sha256 });
      }
    }
  }

  await walkDir(storageRoot);
  report.summary.totalScannedFiles = scannedDiskFiles.size;

  // 2. Query Database Records
  const [employeeDocs, companyDocs] = await Promise.all([
    prisma.employeeDocument.findMany({
      select: {
        id: true,
        companyId: true,
        documentType: true,
        objectKey: true,
        sizeBytes: true,
        fileName: true,
        mimeType: true,
      },
    }),
    prisma.companyDocument.findMany({
      select: {
        id: true,
        companyId: true,
        category: true,
        objectKey: true,
        sizeBytes: true,
        fileName: true,
        mimeType: true,
      },
    }),
  ]);

  const claimedDiskPaths = new Set<string>();

  // Helper to map DB records to possible local paths
  function resolveCandidateDiskPaths(objectKey: string, category: string): string[] {
    const segments = objectKey.split('/');
    const companyId = segments[0];
    const storageName = segments[segments.length - 1];

    const candidates: string[] = [
      objectKey,
      `${companyId}/${storageName}`,
    ];

    if (category === 'EXPENSE_RECEIPT') {
      candidates.push(`receipts/${companyId}/${storageName}`);
    } else if (category === 'COMPANY_DOCUMENT') {
      candidates.push(`company-documents/${companyId}/${storageName}`);
    } else {
      candidates.push(`employee-documents/${companyId}/${storageName}`);
    }

    return candidates;
  }

  // 3. Process Employee Documents
  for (const doc of employeeDocs) {
    if (!doc.objectKey) continue;
    const candidates = resolveCandidateDiskPaths(doc.objectKey, doc.documentType);
    let matchedPath: string | null = null;
    let fileInfo: { size: number; sha256: string } | null = null;

    for (const cand of candidates) {
      if (scannedDiskFiles.has(cand)) {
        matchedPath = cand;
        fileInfo = scannedDiskFiles.get(cand)!;
        claimedDiskPaths.add(cand);
        break;
      }
    }

    if (!matchedPath || !fileInfo) {
      report.items.push({
        id: doc.id,
        category: doc.documentType === 'EXPENSE_RECEIPT' ? 'EXPENSE_RECEIPT' : 'EMPLOYEE_DOCUMENT',
        companyId: doc.companyId,
        localRelativePath: doc.objectKey,
        localAbsolutePath: path.join(storageRoot, doc.objectKey),
        objectKey: doc.objectKey,
        sizeBytes: doc.sizeBytes,
        sha256: '',
        status: 'MISSING_SOURCE',
        error: 'Source file not found on local disk.',
      });
      report.summary.missingSourceFiles++;
    } else {
      report.items.push({
        id: doc.id,
        category: doc.documentType === 'EXPENSE_RECEIPT' ? 'EXPENSE_RECEIPT' : 'EMPLOYEE_DOCUMENT',
        companyId: doc.companyId,
        localRelativePath: matchedPath,
        localAbsolutePath: path.join(storageRoot, matchedPath),
        objectKey: doc.objectKey,
        sizeBytes: fileInfo.size,
        sha256: fileInfo.sha256,
        status: 'PENDING',
      });
      report.summary.matchedDbRecords++;
    }
  }

  // 4. Process Company Documents
  for (const doc of companyDocs) {
    if (!doc.objectKey) continue;
    const candidates = resolveCandidateDiskPaths(doc.objectKey, 'COMPANY_DOCUMENT');
    let matchedPath: string | null = null;
    let fileInfo: { size: number; sha256: string } | null = null;

    for (const cand of candidates) {
      if (scannedDiskFiles.has(cand)) {
        matchedPath = cand;
        fileInfo = scannedDiskFiles.get(cand)!;
        claimedDiskPaths.add(cand);
        break;
      }
    }

    if (!matchedPath || !fileInfo) {
      report.items.push({
        id: doc.id,
        category: 'COMPANY_DOCUMENT',
        companyId: doc.companyId,
        localRelativePath: doc.objectKey,
        localAbsolutePath: path.join(storageRoot, doc.objectKey),
        objectKey: doc.objectKey,
        sizeBytes: doc.sizeBytes || 0,
        sha256: '',
        status: 'MISSING_SOURCE',
        error: 'Source file not found on local disk.',
      });
      report.summary.missingSourceFiles++;
    } else {
      report.items.push({
        id: doc.id,
        category: 'COMPANY_DOCUMENT',
        companyId: doc.companyId,
        localRelativePath: matchedPath,
        localAbsolutePath: path.join(storageRoot, matchedPath),
        objectKey: doc.objectKey,
        sizeBytes: fileInfo.size,
        sha256: fileInfo.sha256,
        status: 'PENDING',
      });
      report.summary.matchedDbRecords++;
    }
  }

  // 5. Detect Orphaned Files on Disk
  for (const [diskPath, info] of scannedDiskFiles.entries()) {
    if (!claimedDiskPaths.has(diskPath)) {
      report.orphans.push({
        path: diskPath,
        sizeBytes: info.size,
        sha256: info.sha256,
      });
      report.summary.orphanedFiles++;
    }
  }

  // 6. Execute / Verify if in active modes
  if (mode === 'execute' || mode === 'verify') {
    let s3Provider: S3StorageProvider;
    if (s3ProviderOverride) {
      s3Provider = s3ProviderOverride;
    } else {
      const config = getStorageConfig();
      if (config.provider !== 's3') {
        throw new Error('S3 provider is not configured. Set STORAGE_PROVIDER=s3 to perform migration.');
      }
      s3Provider = new S3StorageProvider(config);
      report.targetBucket = config.s3.bucketName;
    }

    const concurrency = options.concurrency || 5;
    const pendingItems = report.items.filter((i) => i.status === 'PENDING');

    for (let i = 0; i < pendingItems.length; i += concurrency) {
      const batch = pendingItems.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (item) => {
          try {
            if (mode === 'execute') {
              const buffer = await readFile(item.localAbsolutePath);
              await s3Provider.putObject({
                key: item.objectKey,
                buffer,
                contentType: 'application/octet-stream',
                metadata: {
                  companyId: item.companyId,
                  sha256: item.sha256,
                  migratedAt: new Date().toISOString(),
                },
              });
            }

            // Verify
            const exists = await s3Provider.objectExists(item.objectKey);
            if (!exists) {
              item.status = 'FAILED';
              item.error = 'Destination S3 object was not found after upload.';
              report.summary.failedMigrations++;
            } else {
              const remote = await s3Provider.getObject(item.objectKey);
              if (remote.sha256 && remote.sha256.toLowerCase() !== item.sha256.toLowerCase()) {
                item.status = 'FAILED';
                item.error = `SHA-256 mismatch (source: ${item.sha256}, remote: ${remote.sha256})`;
                report.summary.failedMigrations++;
              } else {
                item.status = 'VERIFIED';
                report.summary.successfulMigrations++;
              }
            }
          } catch (err: any) {
            item.status = 'FAILED';
            item.error = err?.message || 'Migration upload failed.';
            report.summary.failedMigrations++;
          }
        })
      );
    }
  }

  if (options.reportPath) {
    const reportDir = path.dirname(options.reportPath);
    await fs.promises.mkdir(reportDir, { recursive: true });
    await fs.promises.writeFile(options.reportPath, JSON.stringify(report, null, 2), 'utf-8');
  }

  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const isHelp = args.includes('--help') || args.includes('-h');
  if (isHelp) {
    console.log(`
OrbitHR Storage Migration Utility (Local Disk -> Amazon S3)

Usage:
  npx tsx scripts/migrate-storage-to-s3.ts [mode] [options]

Modes:
  --dry-run                    Scan database and disk, compute hashes, generate plan (default)
  --verify                     Verify that existing S3 objects exist and match local SHA-256
  --execute                    Upload missing objects to S3 and verify checksums
  --report                     Alias for dry-run with detailed JSON output

Options:
  --storage-root=<path>        Local directory to scan (default: data/documents)
  --report-path=<path>         Path to write migration JSON report
  --concurrency=<num>          Max concurrent uploads (default: 5)
  --help, -h                   Display this help message
`);
    process.exit(0);
  }

  let mode: MigrationOptions['mode'] = 'dry-run';
  if (args.includes('--execute')) mode = 'execute';
  else if (args.includes('--verify')) mode = 'verify';
  else if (args.includes('--report')) mode = 'report';

  const storageRootArg = args.find((a) => a.startsWith('--storage-root='));
  const storageRoot = storageRootArg ? storageRootArg.split('=')[1] : undefined;

  const reportPathArg = args.find((a) => a.startsWith('--report-path='));
  const reportPath = reportPathArg ? reportPathArg.split('=')[1] : undefined;

  const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : undefined;

  const prisma = new PrismaClient();
  console.log(`[STORAGE_MIGRATION] Starting in ${mode.toUpperCase()} mode...`);

  runStorageMigration(prisma, {
    mode,
    storageRoot,
    reportPath,
    concurrency,
  })
    .then((report) => {
      console.log(`[STORAGE_MIGRATION] Completed with summary:`);
      console.log(JSON.stringify(report.summary, null, 2));
      process.exit(report.summary.failedMigrations > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(`[STORAGE_MIGRATION] Fatal error:`, err?.message || err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
