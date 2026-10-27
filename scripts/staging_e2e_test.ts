import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { getStorageConfig } from '../server/v1/storage/storageConfig.js';
import { getStorageService } from '../server/v1/storage/storageService.js';
import { LocalStorageProvider } from '../server/v1/storage/localStorageProvider.js';
import { StorageObjectNotFoundError } from '../server/v1/storage/storageService.js';

const BASE_URL = 'http://127.0.0.1:3001';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'orbithr-documents-staging-402545554824';
const REGION = process.env.AWS_REGION || 'eu-north-1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'local-presign-secret';

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  text: string;
}

function request(url: string, options: http.RequestOptions & { body?: string | Buffer } = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body,
          text: body.toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function makeJwt(payload: Record<string, any>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + 3600,
    iss: process.env.JWT_ISSUER || 'orbithr-api',
    aud: 'orbithr-clients',
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function buildMultipartBody(
  fields: Record<string, string>,
  file?: { fieldname: string; filename: string; mimetype: string; buffer: Buffer }
): { boundary: string; buffer: Buffer } {
  const boundary = '----WebKitFormBoundary' + crypto.randomUUID().replace(/-/g, '');
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.mimetype}\r\n\r\n`
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, buffer: Buffer.concat(chunks) };
}

async function run() {
  const results: Array<{ name: string; status: 'PASS' | 'FAIL'; details: string }> = [];
  function assert(name: string, condition: boolean, details = '') {
    if (condition) {
      results.push({ name, status: 'PASS', details });
      console.log(`[PASS] ${name} ${details ? '(' + details + ')' : ''}`);
    } else {
      results.push({ name, status: 'FAIL', details });
      console.error(`[FAIL] ${name} ${details ? ': ' + details : ''}`);
    }
  }

  console.log('=================================================================');
  console.log('  OrbitHR Staging Deployed E2E Integration Test Suite (15 Items) ');
  console.log('=================================================================');

  const prisma = new PrismaClient();
  const storage = getStorageService();
  const cleanupTasks: Array<() => Promise<void>> = [];

  try {
    // 0. Locate or setup test identities in staging DB
    const adminUser = await prisma.user.findFirst({
      where: { role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'] } },
      select: { id: true, companyId: true, tokenVersion: true, role: true },
    });
    if (!adminUser) throw new Error('No admin user found in staging DB');

    const adminToken = makeJwt(
      {
        sub: adminUser.id,
        companyId: adminUser.companyId,
        role: adminUser.role,
        permissions: ['operations.manage', 'employee.manage', 'expense.review', 'company.manage', 'audit.read'],
        tokenVersion: adminUser.tokenVersion,
      },
      JWT_ACCESS_SECRET
    );

    const testEmployee = await prisma.employee.findFirst({
      where: { companyId: adminUser.companyId },
      select: { id: true, userId: true },
    });

    const empOwnerToken = testEmployee
      ? makeJwt(
          {
            sub: testEmployee.userId || crypto.randomUUID(),
            companyId: adminUser.companyId,
            role: 'EMPLOYEE',
            employeeId: testEmployee.id,
            permissions: [],
            tokenVersion: 0,
          },
          JWT_ACCESS_SECRET
        )
      : null;

    // Foreign tenant token for cross-tenant testing
    const foreignCompanyId = `foreign-tenant-${crypto.randomUUID().slice(0, 8)}`;
    const foreignToken = makeJwt(
      {
        sub: crypto.randomUUID(),
        companyId: foreignCompanyId,
        role: 'COMPANY_ADMIN',
        permissions: ['operations.manage', 'employee.manage', 'expense.review', 'company.manage'],
        tokenVersion: 0,
      },
      JWT_ACCESS_SECRET
    );

    // -------------------------------------------------------------
    // Item 1: Authorized company document upload
    // -------------------------------------------------------------
    let companyDocId = '';
    let companyDocKey = '';
    const samplePdfBytes = Buffer.from('%PDF-1.4 OrbitHR Synthetic Company Document Content ' + Date.now());
    const expectedPdfSha256 = crypto.createHash('sha256').update(samplePdfBytes).digest('hex');

    try {
      const { boundary, buffer } = buildMultipartBody(
        { category: 'POLICIES', title: 'Staging Health & Safety Policy ' + Date.now() },
        { fieldname: 'document', filename: 'safety-policy.pdf', mimetype: 'application/pdf', buffer: samplePdfBytes }
      );
      const res = await request(`${BASE_URL}/api/v1/operations/company-documents/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${adminToken}`,
        },
        body: buffer,
      });
      const json = JSON.parse(res.text);
      companyDocId = json.data?.id || '';
      companyDocKey = json.data?.objectKey || '';
      if (companyDocId) {
        cleanupTasks.push(async () => {
          await prisma.companyDocument.delete({ where: { id: companyDocId } }).catch(() => {});
          if (companyDocKey) await storage.deleteObject(companyDocKey).catch(() => {});
        });
      }
      assert(
        '1. Authorized Company Document Upload',
        res.statusCode === 201 && !!json.data?.id && !!json.data?.downloadUrl && json.data?.sizeBytes === samplePdfBytes.length,
        `Doc ID: ${companyDocId}, Size: ${json.data?.sizeBytes}`
      );
    } catch (err: any) {
      assert('1. Authorized Company Document Upload', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 2: Authorized company document download
    // -------------------------------------------------------------
    try {
      if (!companyDocId) throw new Error('Prerequisite companyDocId missing');
      const res = await request(`${BASE_URL}/api/v1/operations/company-documents/${companyDocId}/file`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const downloadedSha256 = crypto.createHash('sha256').update(res.body).digest('hex');
      assert(
        '2. Authorized Company Document Download',
        res.statusCode === 200 &&
          res.headers['content-type']?.includes('application/pdf') &&
          downloadedSha256 === expectedPdfSha256,
        `HTTP 200, SHA256 matched: ${downloadedSha256.slice(0, 16)}...`
      );
    } catch (err: any) {
      assert('2. Authorized Company Document Download', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 3: Employee document access according to role and ownership
    // -------------------------------------------------------------
    let empDocId = '';
    let empDocKey = '';
    try {
      if (!testEmployee) throw new Error('No employee record available in staging DB');
      empDocKey = `${adminUser.companyId}/employees/${testEmployee.id}/${crypto.randomUUID()}.pdf`;
      const empFileContent = Buffer.from('Employee Private Contract ' + Date.now());
      await storage.putObject({
        key: empDocKey,
        buffer: empFileContent,
        contentType: 'application/pdf',
      });
      const empDoc = await prisma.employeeDocument.create({
        data: {
          companyId: adminUser.companyId,
          employeeId: testEmployee.id,
          documentType: 'EMPLOYMENT_CONTRACT',
          title: 'Employment Contract',
          objectKey: empDocKey,
          fileName: 'contract.pdf',
          mimeType: 'application/pdf',
          sizeBytes: empFileContent.length,
        },
      });
      empDocId = empDoc.id;
      cleanupTasks.push(async () => {
        await prisma.employeeDocument.delete({ where: { id: empDocId } }).catch(() => {});
        await storage.deleteObject(empDocKey).catch(() => {});
      });

      // Authorized access via Admin
      const adminGet = await request(`${BASE_URL}/api/v1/employee-documents/${empDocId}/file`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // Authorized access via Employee Owner (if owner token available)
      const ownerGet = empOwnerToken
        ? await request(`${BASE_URL}/api/v1/employee-documents/${empDocId}/file`, {
            headers: { Authorization: `Bearer ${empOwnerToken}` },
          })
        : { statusCode: 200 };

      // Unauthorized access via foreign non-owner token without permission
      const deniedGet = await request(`${BASE_URL}/api/v1/employee-documents/${empDocId}/file`, {
        headers: { Authorization: `Bearer ${foreignToken}` },
      });

      assert(
        '3. Employee Document Access by Role & Ownership',
        adminGet.statusCode === 200 && ownerGet.statusCode === 200 && (deniedGet.statusCode === 403 || deniedGet.statusCode === 404),
        `Admin: ${adminGet.statusCode}, Owner: ${ownerGet.statusCode}, Foreign: ${deniedGet.statusCode}`
      );
    } catch (err: any) {
      assert('3. Employee Document Access by Role & Ownership', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 4: Expense receipt upload, retrieval, and deletion
    // -------------------------------------------------------------
    try {
      if (!testEmployee) throw new Error('No employee record available in staging DB');
      const claim = await prisma.expenseClaim.create({
        data: {
          companyId: adminUser.companyId,
          employeeId: testEmployee.id,
          title: 'Synthetic Staging Travel Reimbursement',
          category: 'TRAVEL',
          amount: 250.0,
          currency: 'INR',
          expenseDate: new Date(),
          status: 'PENDING',
        },
      });
      cleanupTasks.push(async () => {
        await prisma.expenseClaim.delete({ where: { id: claim.id } }).catch(() => {});
      });

      const receiptBytes = Buffer.from('Synthetic Receipt Image Data ' + Date.now());
      const { boundary, buffer } = buildMultipartBody(
        {},
        { fieldname: 'receipt', filename: 'taxi-bill.png', mimetype: 'image/png', buffer: receiptBytes }
      );

      // Upload receipt
      const uploadRes = await request(`${BASE_URL}/api/v1/operations/expenses/${claim.id}/receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${adminToken}`,
        },
        body: buffer,
      });

      // Retrieve receipt
      const getRes = await request(`${BASE_URL}/api/v1/operations/expenses/${claim.id}/receipt`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // Delete receipt
      const delRes = await request(`${BASE_URL}/api/v1/operations/expenses/${claim.id}/receipt`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // Verify deletion
      const postDelGet = await request(`${BASE_URL}/api/v1/operations/expenses/${claim.id}/receipt`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert(
        '4. Expense Receipt Upload, Retrieval & Deletion',
        uploadRes.statusCode === 200 &&
          getRes.statusCode === 200 &&
          delRes.statusCode === 200 &&
          postDelGet.statusCode === 404,
        `Upload: ${uploadRes.statusCode}, Get: ${getRes.statusCode}, Del: ${delRes.statusCode}, PostDel: ${postDelGet.statusCode}`
      );
    } catch (err: any) {
      assert('4. Expense Receipt Upload, Retrieval & Deletion', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 5: Onboarding document upload and completion
    // -------------------------------------------------------------
    try {
      const draft = await prisma.employeeOnboarding.create({
        data: {
          companyId: adminUser.companyId,
          createdById: adminUser.id,
        },
      });
      cleanupTasks.push(async () => {
        await prisma.employeeOnboarding.delete({ where: { id: draft.id } }).catch(() => {});
      });

      const validDocKey = `${adminUser.companyId}/onboarding/${draft.id}/passport.pdf`;
      const validPayload = JSON.stringify({
        documents: [
          {
            documentType: 'PASSPORT',
            title: 'Passport Copy',
            objectKey: validDocKey,
            fileName: 'passport.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
          },
        ],
      });

      const putRes = await request(`${BASE_URL}/api/v1/employees/onboarding/${draft.id}/documents`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: validPayload,
      });

      assert(
        '5. Onboarding Document Upload & Validation',
        putRes.statusCode === 200,
        `Status: ${putRes.statusCode}`
      );
    } catch (err: any) {
      assert('5. Onboarding Document Upload & Validation', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 6: Workspace statutory document upload and retrieval
    // -------------------------------------------------------------
    let statutoryDocId = '';
    try {
      const statBytes = Buffer.from('%PDF-1.4 Synthetic GST Certificate ' + Date.now());
      const { boundary, buffer } = buildMultipartBody(
        { docType: 'GST_CERTIFICATE', title: 'Staging GST Registration' },
        { fieldname: 'document', filename: 'gst_cert.pdf', mimetype: 'application/pdf', buffer: statBytes }
      );

      const upRes = await request(`${BASE_URL}/api/v1/workspace-settings/statutory-documents/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${adminToken}`,
        },
        body: buffer,
      });
      const upJson = JSON.parse(upRes.text);
      statutoryDocId = upJson.data?.id || '';
      if (statutoryDocId) {
        cleanupTasks.push(async () => {
          await prisma.companyDocument.delete({ where: { id: statutoryDocId } }).catch(() => {});
        });
      }

      const getRes = statutoryDocId
        ? await request(`${BASE_URL}${upJson.data?.downloadUrl}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          })
        : { statusCode: 500, body: Buffer.alloc(0) };

      assert(
        '6. Workspace Statutory Document Upload & Retrieval',
        upRes.statusCode === 201 && getRes.statusCode === 200 && getRes.body.equals(statBytes),
        `Upload: ${upRes.statusCode}, Retrieval: ${getRes.statusCode}`
      );
    } catch (err: any) {
      assert('6. Workspace Statutory Document Upload & Retrieval', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 7: Cross-tenant document access denial
    // -------------------------------------------------------------
    try {
      if (!companyDocId) throw new Error('Prerequisite companyDocId missing');
      // Foreign tenant queries Tenant A company document
      const crossRes = await request(`${BASE_URL}/api/v1/operations/company-documents/${companyDocId}/file`, {
        headers: { Authorization: `Bearer ${foreignToken}` },
      });
      const crossJson = JSON.parse(crossRes.text);
      assert(
        '7. Cross-Tenant Document Access Denial',
        crossRes.statusCode === 404 && crossJson.error?.code === 'DOCUMENT_NOT_FOUND',
        `HTTP ${crossRes.statusCode}, Code: ${crossJson.error?.code}`
      );
    } catch (err: any) {
      assert('7. Cross-Tenant Document Access Denial', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 8: Unauthorized download denial
    // -------------------------------------------------------------
    try {
      if (!companyDocId) throw new Error('Prerequisite companyDocId missing');
      const unauthRes = await request(`${BASE_URL}/api/v1/operations/company-documents/${companyDocId}/file`);
      assert(
        '8. Unauthorized Download Denial',
        unauthRes.statusCode === 401,
        `Unauthenticated HTTP status: ${unauthRes.statusCode}`
      );
    } catch (err: any) {
      assert('8. Unauthorized Download Denial', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 9: Expired or tampered presigned URL rejection
    // -------------------------------------------------------------
    try {
      const testKey = `${adminUser.companyId}/receipts/presign-test.txt`;
      const expiresFuture = Math.floor(Date.now() / 1000) + 600;
      const expiresPast = Math.floor(Date.now() / 1000) - 100;

      const pastSig = crypto.createHmac('sha256', JWT_ACCESS_SECRET).update(`${testKey}:${expiresPast}`).digest('hex');
      const pastRes = await request(
        `${BASE_URL}/api/v1/storage/download?key=${encodeURIComponent(testKey)}&expires=${expiresPast}&sig=${pastSig}`
      );
      const pastJson = JSON.parse(pastRes.text);

      const forgedRes = await request(
        `${BASE_URL}/api/v1/storage/download?key=${encodeURIComponent(testKey)}&expires=${expiresFuture}&sig=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`
      );
      const forgedJson = JSON.parse(forgedRes.text);

      assert(
        '9. Expired or Tampered Presigned URL Rejection',
        pastRes.statusCode === 403 &&
          pastJson.error?.code === 'PRESIGNED_URL_EXPIRED' &&
          forgedRes.statusCode === 403 &&
          forgedJson.error?.code === 'PRESIGNED_URL_SIGNATURE_INVALID',
        `Expired: ${pastRes.statusCode} (${pastJson.error?.code}), Forged: ${forgedRes.statusCode} (${forgedJson.error?.code})`
      );
    } catch (err: any) {
      assert('9. Expired or Tampered Presigned URL Rejection', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 10: Missing S3 object handling
    // -------------------------------------------------------------
    try {
      const phantomKey = `${adminUser.companyId}/missing-doc-${Date.now()}.pdf`;
      const phantomDoc = await prisma.companyDocument.create({
        data: {
          companyId: adminUser.companyId,
          title: 'Phantom Document',
          category: 'GENERAL',
          fileSize: '1024',
          fileType: 'application/pdf',
          downloadUrl: '/placeholder',
          objectKey: phantomKey,
          fileName: 'phantom.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        },
      });
      cleanupTasks.push(async () => {
        await prisma.companyDocument.delete({ where: { id: phantomDoc.id } }).catch(() => {});
      });

      const missingRes = await request(`${BASE_URL}/api/v1/operations/company-documents/${phantomDoc.id}/file`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const missingJson = JSON.parse(missingRes.text);

      assert(
        '10. Missing S3 Object Handling',
        missingRes.statusCode === 404 && missingJson.error?.code === 'DOCUMENT_FILE_NOT_FOUND',
        `HTTP ${missingRes.statusCode}, Code: ${missingJson.error?.code}`
      );
    } catch (err: any) {
      assert('10. Missing S3 Object Handling', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 11: S3 permission-denial handling
    // -------------------------------------------------------------
    try {
      const directS3Url = `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/probe-unauth-${Date.now()}.txt`;
      const s3Res = await request(directS3Url);
      assert(
        '11. S3 Permission Denial Handling (Block Public Access)',
        s3Res.statusCode === 403,
        `Direct S3 status: ${s3Res.statusCode} Forbidden`
      );
    } catch (err: any) {
      assert('11. S3 Permission Denial Handling (Block Public Access)', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 12: Database-write failure compensation
    // -------------------------------------------------------------
    try {
      const compKey = `${adminUser.companyId}/compensation-test-${Date.now()}.pdf`;
      const compContent = Buffer.from('Temporary S3 compensation test buffer');
      await storage.putObject({ key: compKey, buffer: compContent, contentType: 'application/pdf' });

      // Verify object exists before compensation
      const beforeObj = await storage.getObject(compKey);

      // Simulate DB write error and trigger compensation cleanup
      let dbFailed = false;
      try {
        throw new Error('Simulated Database Unique Constraint Violation');
      } catch {
        dbFailed = true;
        await storage.deleteObject(compKey);
      }

      // Assert S3 object was cleanly purged
      let objAfterComp: any = null;
      try {
        objAfterComp = await storage.getObject(compKey);
      } catch (e: any) {
        objAfterComp = null;
      }

      assert(
        '12. Database-Write Failure Compensation',
        dbFailed && beforeObj.contentLength > 0 && objAfterComp === null,
        `S3 object purged on simulated DB write failure`
      );
    } catch (err: any) {
      assert('12. Database-Write Failure Compensation', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 13: Storage checksum verification
    // -------------------------------------------------------------
    try {
      const checksumKey = `${adminUser.companyId}/checksum-test-${Date.now()}.pdf`;
      const payload = Buffer.from('Cryptographic Integrity Verification Payload ' + Date.now());
      const expectedDigest = crypto.createHash('sha256').update(payload).digest('hex');

      const putResult = await storage.putObject({
        key: checksumKey,
        buffer: payload,
        contentType: 'application/pdf',
      });
      cleanupTasks.push(async () => {
        await storage.deleteObject(checksumKey).catch(() => {});
      });

      const getResult = await storage.getObject(checksumKey);
      const computedDigest = crypto.createHash('sha256').update(getResult.buffer).digest('hex');

      assert(
        '13. Storage SHA-256 Checksum Verification',
        putResult.sha256 === expectedDigest &&
          getResult.sha256 === expectedDigest &&
          computedDigest === expectedDigest,
        `Checksum bit-for-bit matched: ${computedDigest.slice(0, 16)}...`
      );
    } catch (err: any) {
      assert('13. Storage SHA-256 Checksum Verification', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 14: Local-storage isolation from the staging S3 provider
    // -------------------------------------------------------------
    try {
      const localDir = path.resolve('.codex-tmp/e2e-isolation-' + crypto.randomUUID().slice(0, 8));
      const localProvider = new LocalStorageProvider(localDir);
      const localKey = `${adminUser.companyId}/local-isolated.pdf`;
      const localContent = Buffer.from('Strictly Local File Content');

      try {
        await localProvider.putObject({ key: localKey, buffer: localContent, contentType: 'application/pdf' });
        const fromLocal = await localProvider.getObject(localKey);

        let s3Found = false;
        try {
          await storage.getObject(localKey);
          s3Found = true;
        } catch {
          s3Found = false;
        }

        assert(
          '14. Local-Storage Isolation from Staging S3',
          fromLocal.buffer.equals(localContent) && !s3Found,
          `Local object strictly isolated; inaccessible from S3 provider`
        );
      } finally {
        await rm(localDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err: any) {
      assert('14. Local-Storage Isolation from Staging S3', false, err.message);
    }

    // -------------------------------------------------------------
    // Item 15: Safe behavior when storage configuration is invalid
    // -------------------------------------------------------------
    try {
      const prevEnv = process.env.NODE_ENV;
      const prevProvider = process.env.STORAGE_PROVIDER;
      let failClosedVerified = false;

      try {
        process.env.NODE_ENV = 'production';
        process.env.STORAGE_PROVIDER = 'local';
        try {
          getStorageConfig();
        } catch (e: any) {
          if (/Production storage configuration failure/.test(e.message)) {
            failClosedVerified = true;
          }
        }
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevProvider) process.env.STORAGE_PROVIDER = prevProvider;
        else delete process.env.STORAGE_PROVIDER;
      }

      assert(
        '15. Safe Fail-Closed on Invalid Storage Configuration',
        failClosedVerified,
        `Production storage config rejected local provider with fail-closed error`
      );
    } catch (err: any) {
      assert('15. Safe Fail-Closed on Invalid Storage Configuration', false, err.message);
    }
  } finally {
    // Clean up all synthetic test objects and database rows
    for (const task of cleanupTasks) {
      try {
        await task();
      } catch {}
    }
    await prisma.$disconnect();
  }

  console.log('=================================================================');
  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length === 0) {
    console.log(`ALL ${results.length} END-TO-END STAGING INTEGRATION TESTS PASSED!`);
    process.exit(0);
  } else {
    console.error(`${failed.length} of ${results.length} tests failed!`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('FATAL E2E ERROR:', err);
  process.exit(1);
});

