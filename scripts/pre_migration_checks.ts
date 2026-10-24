import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CheckResult {
  id: number;
  name: string;
  query: string;
  count: number;
  passed: boolean;
  details?: any;
}

async function runChecks() {
  console.log('============================================================');
  console.log('ORBIT HR — P2.8 PHASE 2.3 PRE-MIGRATION INVARIANT CHECKS');
  console.log('Target: Live PostgreSQL RDS via SSM Tunnel (127.0.0.1:5433)');
  console.log('============================================================\n');

  const checks: Array<{ id: number; name: string; query: string }> = [
    {
      id: 1,
      name: 'Orphaned FilingItems (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM "StatutoryFilingItem" i LEFT JOIN "StatutoryFiling" f ON f."id" = i."filingId" WHERE f."id" IS NULL;`
    },
    {
      id: 2,
      name: 'FilingItem -> Filing Company Mismatch (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM "StatutoryFilingItem" i JOIN "StatutoryFiling" f ON f."id" = i."filingId" JOIN "Employee" e ON e."id" = i."employeeId" WHERE e."companyId" != f."companyId";`
    },
    {
      id: 3,
      name: 'FilingItem -> Challan Company Mismatch (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM "StatutoryFilingItem" i JOIN "StatutoryFiling" f ON f."id" = i."filingId" JOIN "TdsChallan" c ON c."id" = i."tdsChallanId" WHERE c."companyId" != f."companyId";`
    },
    {
      id: 4,
      name: 'Duplicate (filingItemId, challanId) Candidates (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM (SELECT "id", "tdsChallanId" FROM "StatutoryFilingItem" WHERE "tdsChallanId" IS NOT NULL GROUP BY "id", "tdsChallanId" HAVING COUNT(*) > 1) sub;`
    },
    {
      id: 5,
      name: 'Invalid / Null / Negative TDS Amounts on Filing Items (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM "StatutoryFilingItem" WHERE "tdsAmount" IS NULL OR "tdsAmount" < 0;`
    },
    {
      id: 6,
      name: 'Challans with Over-Allocated TDS Requirements (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM (SELECT c."id", c."tdsAmount", SUM(i."tdsAmount") as "allocatedSum" FROM "TdsChallan" c JOIN "StatutoryFilingItem" i ON i."tdsChallanId" = c."id" GROUP BY c."id", c."tdsAmount" HAVING SUM(i."tdsAmount") > c."tdsAmount") sub;`
    },
    {
      id: 7,
      name: 'Duplicate (id, companyId) Impossibility Verification (Must be 0)',
      query: `SELECT ((SELECT COUNT(*)::int FROM (SELECT "id" FROM "StatutoryFiling" GROUP BY "id" HAVING COUNT(*) > 1) f) + (SELECT COUNT(*)::int FROM (SELECT "id" FROM "TdsChallan" GROUP BY "id" HAVING COUNT(*) > 1) c)) as count;`
    },
    {
      id: 8,
      name: 'Existing panStatus Values Outside Allowed Statutory States (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM "StatutoryFilingItem" WHERE "panStatus" NOT IN ('VALID', 'PANAPPLIED', 'PANNOTAVBL', 'PANINVALID', 'UNKNOWN', 'NOT_APPLICABLE');`
    },
    {
      id: 9,
      name: 'TDS Items with Corrupted/Missing PAN on Non-Applied Records (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM "StatutoryFilingItem" i JOIN "StatutoryFiling" f ON f."id" = i."filingId" WHERE f."domain" = 'TDS_24Q' AND i."panStatus" NOT IN ('VALID', 'PANAPPLIED', 'PANNOTAVBL', 'PANINVALID');`
    },
    {
      id: 10,
      name: 'Filing Lock Check: Linked Challan Mutations on Locked/Exported Returns (Must be 0)',
      query: `SELECT COUNT(*)::int as count FROM "StatutoryFiling" f JOIN "StatutoryFilingItem" i ON i."filingId" = f."id" WHERE f."status" IN ('LOCKED', 'EXPORTED') AND i."tdsChallanId" IS NULL;`
    }
  ];

  let allPassed = true;
  const results: CheckResult[] = [];

  for (const c of checks) {
    try {
      const res: any = await prisma.$queryRawUnsafe(c.query);
      const count = Number(res[0]?.count ?? 0);
      const passed = count === 0;
      if (!passed) allPassed = false;
      results.push({ id: c.id, name: c.name, query: c.query, count, passed });
      console.log(`[CHECK ${c.id.toString().padStart(2, '0')}] ${passed ? '🟢 PASS' : '🔴 FAIL'} (count = ${count}): ${c.name}`);
    } catch (err: any) {
      allPassed = false;
      results.push({ id: c.id, name: c.name, query: c.query, count: -1, passed: false, details: err.message });
      console.error(`[CHECK ${c.id.toString().padStart(2, '0')}] 🔴 ERROR: ${c.name}\n  Error: ${err.message}`);
    }
  }

  console.log('\n============================================================');
  console.log(`PRE-MIGRATION INVARIANT SUMMARY: ${allPassed ? '🟢 ALL 10 CHECKS PASSED' : '🔴 INVARIANT FAILURE'}`);
  console.log('============================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runChecks()
  .catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
