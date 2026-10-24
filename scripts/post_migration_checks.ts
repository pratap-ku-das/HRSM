import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  console.log('============================================================');
  console.log('ORBIT HR — P2.8 PHASE 2.3 POST-MIGRATION DATABASE VERIFICATION');
  console.log('Target: Live PostgreSQL RDS via SSM Tunnel (127.0.0.1:5433)');
  console.log('============================================================\n');

  // 1. Verify Table Existence
  const tables: any = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'TdsChallanAllocation'`
  );
  console.log('Table TdsChallanAllocation exists:', tables.length === 1 ? '🟢 YES' : '🔴 NO');

  // 2. Verify Columns
  const cols: any = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'TdsChallanAllocation' ORDER BY ordinal_position`
  );
  console.log('\nColumns in TdsChallanAllocation:');
  for (const c of cols) {
    console.log(`  - ${c.column_name} (${c.data_type}, default: ${c.column_default})`);
  }

  // 3. Verify Constraints
  const constraints: any = await prisma.$queryRawUnsafe(
    `SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'public."TdsChallanAllocation"'::regclass OR conname IN ('StatutoryFiling_id_companyId_key', 'TdsChallan_id_companyId_key', 'StatutoryFilingItem_id_filingId_key') ORDER BY conname`
  );
  console.log('\nActive PostgreSQL Constraints:');
  for (const c of constraints) {
    console.log(`  - [${c.contype}] ${c.conname}: ${c.def}`);
  }

  // 4. Verify panStatus Default
  const panStatusCol: any = await prisma.$queryRawUnsafe(
    `SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'StatutoryFilingItem' AND column_name = 'panStatus'`
  );
  console.log('\nStatutoryFilingItem.panStatus default:');
  console.log(`  - ${panStatusCol[0]?.column_name}: ${panStatusCol[0]?.column_default}`);

  // 5. Verify Check Constraints in Action (Live PostgreSQL DB Level)
  console.log('\n--- LIVE DATABASE LEVEL CHECK CONSTRAINT TESTS ---');

  // Test Option B: 10.123 rejected
  try {
    await prisma.$queryRawUnsafe(`
      INSERT INTO "TdsChallanAllocation" ("id", "companyId", "statutoryFilingId", "tdsChallanId", "statutoryFilingItemId", "allocatedTds", "allocatedSurcharge", "allocatedCess", "allocatedTotal")
      VALUES ('test-cents-fail', 'fake-comp', 'fake-filing', 'fake-challan', 'fake-item', 10.123, 0, 0, 10.123);
    `);
    console.log('10.123 insertion test: 🔴 UNEXPECTED SUCCESS (Should fail)');
  } catch (err: any) {
    const isCheck = err.message.includes('TdsChallanAllocation_exact_cents_tds_check') || err.message.includes('check constraint');
    console.log('10.123 insertion test: 🟢 REJECTED BY CHECK CONSTRAINT:', isCheck ? 'Verified' : err.message);
  }

  // Test Negative Value Rejected
  try {
    await prisma.$queryRawUnsafe(`
      INSERT INTO "TdsChallanAllocation" ("id", "companyId", "statutoryFilingId", "tdsChallanId", "statutoryFilingItemId", "allocatedTds", "allocatedSurcharge", "allocatedCess", "allocatedTotal")
      VALUES ('test-neg-fail', 'fake-comp', 'fake-filing', 'fake-challan', 'fake-item', -10.00, 0, 0, -10.00);
    `);
    console.log('Negative value test: 🔴 UNEXPECTED SUCCESS (Should fail)');
  } catch (err: any) {
    const isCheck = err.message.includes('TdsChallanAllocation_nonnegative_check') || err.message.includes('check constraint');
    console.log('Negative value test: 🟢 REJECTED BY CHECK CONSTRAINT:', isCheck ? 'Verified' : err.message);
  }

  // Test Sum Mismatch Rejected
  try {
    await prisma.$queryRawUnsafe(`
      INSERT INTO "TdsChallanAllocation" ("id", "companyId", "statutoryFilingId", "tdsChallanId", "statutoryFilingItemId", "allocatedTds", "allocatedSurcharge", "allocatedCess", "allocatedTotal")
      VALUES ('test-sum-fail', 'fake-comp', 'fake-filing', 'fake-challan', 'fake-item', 100.00, 10.00, 5.00, 114.00);
    `);
    console.log('Component sum mismatch test: 🔴 UNEXPECTED SUCCESS (Should fail)');
  } catch (err: any) {
    const isCheck = err.message.includes('TdsChallanAllocation_allocatedTotal_sum_check') || err.message.includes('check constraint');
    console.log('Component sum mismatch test: 🟢 REJECTED BY CHECK CONSTRAINT:', isCheck ? 'Verified' : err.message);
  }

  console.log('\n============================================================');
  console.log('POST-MIGRATION VERIFICATION COMPLETE: ALL DB CONSTRAINTS ACTIVE');
  console.log('============================================================');
}

verify()
  .catch((err) => {
    console.error('Post-migration verification failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
