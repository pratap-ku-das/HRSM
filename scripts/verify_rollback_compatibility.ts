import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "../server/databaseUrl.js";
import { calculatePayroll, type SalaryComponentInput } from "../server/v1/payrollEngine.js";

interface TestResult {
  step: string;
  workflow: string;
  status: "PASS" | "FAIL";
  latencyMs: number;
  details: string;
}

const results: TestResult[] = [];

async function runStep(step: string, workflow: string, fn: () => Promise<string>) {
  const start = Date.now();
  try {
    const details = await fn();
    const latencyMs = Date.now() - start;
    results.push({ step, workflow, status: "PASS", latencyMs, details });
    console.log(`[PASS] ${step}: ${workflow} (${latencyMs}ms) - ${details}`);
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    results.push({ step, workflow, status: "FAIL", latencyMs, details: err.message || String(err) });
    console.error(`[FAIL] ${step}: ${workflow} (${latencyMs}ms) - Error: ${err.message}`);
    throw err;
  }
}

async function main() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL must be configured for empirical rollback verification.");
  }

  const databaseUrl = normalizeDatabaseUrl(rawUrl);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  const ts = Date.now();
  const testCompanyId = `compat-test-company-${ts}`;
  const testDeptId = `compat-test-dept-${ts}`;
  const testDesigId = `compat-test-desig-${ts}`;
  const testUserId = `compat-test-user-${ts}`;
  const testEmployeeId = `compat-test-emp-${ts}`;
  const testPayrollRunId = `compat-test-run-${ts}`;

  console.log("=================================================================");
  console.log("  OrbitHR P2.10 RC2 — Empirical Rollback Compatibility Suite    ");
  console.log("  Target: Schema with Migrations #31 & #32 Applied               ");
  console.log(`  Database URL: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log("=================================================================\n");

  try {
    // Step 1: Healthcheck and Connectivity Invariant
    await runStep("1. Healthcheck", "GET /api/health query emulation", async () => {
      const res = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
      if (!res || res[0]?.ok !== 1) throw new Error("Healthcheck query failed");
      return "Database responsive; SELECT 1 returned ok=1";
    });

    // Step 2: Tenant & Organization Hierarchy
    await runStep("2. Tenant Isolation", "Create isolated synthetic tenant & department/designation", async () => {
      await prisma.company.create({
        data: {
          id: testCompanyId,
          name: "Rollback Compat Test Corp",
          slug: `rollback-corp-${ts}`,
          email: `admin-${ts}@compat-test.com`,
          industry: "Technology",
          size: "50-100",
          plan: "ENTERPRISE",
        },
      });

      await prisma.department.create({
        data: {
          id: testDeptId,
          companyId: testCompanyId,
          name: "Engineering",
          code: "ENG",
        },
      });

      await prisma.designation.create({
        data: {
          id: testDesigId,
          companyId: testCompanyId,
          departmentId: testDeptId,
          title: "Senior Engineer",
        },
      });

      return `Created Company ID: ${testCompanyId}, Dept: ${testDeptId}, Desig: ${testDesigId}`;
    });

    // Step 3: User Authentication & Tenant Resolution
    await runStep("3. User Authentication", "Create user & resolve with company relation", async () => {
      const user = await prisma.user.create({
        data: {
          id: testUserId,
          companyId: testCompanyId,
          email: `admin-${ts}@compat-test.com`,
          fullName: "Compatibility Test Admin",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
          role: "COMPANY_ADMIN",
        },
        include: { company: true },
      });
      if (!user.company || user.company.id !== testCompanyId) {
        throw new Error("Company relation resolution failed");
      }
      return `Resolved User ${user.email} in Company ${user.company.id}`;
    });

    // Step 4: Employee Lifecycle CRUD against Migrated Schema
    await runStep("4. Employee CRUD", "Insert and query employee profile", async () => {
      const emp = await prisma.employee.create({
        data: {
          id: testEmployeeId,
          companyId: testCompanyId,
          userId: testUserId,
          departmentId: testDeptId,
          designationId: testDesigId,
          employeeCode: `EMP-COMPAT-001`,
          firstName: "Suresh",
          lastName: "Patel",
          email: `suresh-${ts}@compat-test.com`,
          dateOfJoining: new Date("2024-01-15"),
          employmentType: "FULL_TIME",
          status: "ACTIVE",
          basicSalary: 45000,
          hra: 18000,
          allowances: 7000,
          providentFund: 1800,
          taxDeduction: 2500,
          currency: "INR",
        },
      });

      const retrieved = await prisma.employee.findUnique({
        where: { id: emp.id },
      });
      if (!retrieved || retrieved.basicSalary !== 45000) {
        throw new Error("Employee verification mismatch");
      }
      return `Created & retrieved employee ${emp.employeeCode} (Basic: ₹${retrieved.basicSalary})`;
    });

    // Step 5: Expense Reimbursement Lifecycle (P2.6B Invariant)
    await runStep("5. Expense Lifecycle", "Create claim & 1:1 reimbursement adjustment", async () => {
      const claim = await prisma.expenseClaim.create({
        data: {
          companyId: testCompanyId,
          employeeId: testEmployeeId,
          amount: 3500,
          currency: "INR",
          title: "Client Site Travel",
          category: "TRAVEL",
          expenseDate: new Date("2026-10-15"),
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });

      const adjustment = await prisma.payrollAdjustment.create({
        data: {
          companyId: testCompanyId,
          employeeId: testEmployeeId,
          month: "2026-10",
          code: "REIMB_EXPENSE",
          name: "Expense Reimbursement",
          amount: 3500,
          kind: "REIMBURSEMENT",
          reason: "Approved Expense Claim Reimbursement",
          createdById: testUserId,
          expenseClaimId: claim.id,
        },
      });

      if (adjustment.expenseClaimId !== claim.id) {
        throw new Error("Reimbursement 1:1 linkage failed");
      }
      return `Linked Claim ${claim.id} to Adjustment ${adjustment.id} (₹${adjustment.amount})`;
    });

    // Step 6: Payroll Calculation Engine Execution (P2.5/P2.6B/P2.9)
    await runStep("6. Payroll Engine", "Execute calculation with statutory deductions", async () => {
      const components: SalaryComponentInput[] = [
        { code: "BASIC", name: "Basic Salary", kind: "EARNING", method: "FIXED", value: 45000, proratable: true, taxable: true },
        { code: "HRA", name: "HRA", kind: "EARNING", method: "FIXED", value: 18000, proratable: true, taxable: false },
        { code: "SA", name: "Special Allowance", kind: "EARNING", method: "FIXED", value: 7000, proratable: true, taxable: true },
      ];

      const calculation = calculatePayroll({
        workingDays: 22,
        payableDays: 22,
        components,
        rules: [
          { type: "PROFESSIONAL_TAX", configuration: {}, stateCode: "KA" },
        ],
        ptState: "KA",
        payrollMonth: 10,
        payrollYear: 2026,
        adjustments: [
          { code: "REIMB_EXPENSE", name: "Expense Reimbursement", kind: "REIMBURSEMENT", amount: 3500 },
        ],
      });

      if (calculation.grossEarnings !== 70000) {
        throw new Error(`Gross earnings mismatch: expected 70000, got ${calculation.grossEarnings}`);
      }
      if (calculation.netPay !== 73300) {
        // Gross 70000 - PT 200 + Reimb 3500 = 73300
        throw new Error(`Net pay mismatch: expected 73300, got ${calculation.netPay}`);
      }

      // Persist synthetic PayrollRun and line
      const run = await prisma.payrollRun.create({
        data: {
          id: testPayrollRunId,
          companyId: testCompanyId,
          month: "2026-10",
          status: "CALCULATED",
          totalEmployees: 1,
          totalGrossSalary: calculation.grossEarnings,
          totalDeductions: calculation.employeeDeductions,
          totalNetPayout: calculation.netPay,
        },
      });

      const line = await prisma.payrollLine.create({
        data: {
          payrollRunId: run.id,
          employeeId: testEmployeeId,
          workingDays: calculation.workingDays,
          payableDays: calculation.payableDays,
          unpaidDays: calculation.unpaidDays,
          grossEarnings: calculation.grossEarnings,
          employeeDeductions: calculation.employeeDeductions,
          employerContributions: calculation.employerContributions,
          reimbursements: calculation.reimbursements,
          netPay: calculation.netPay,
          breakdown: calculation.breakdown,
          calculationTrace: calculation.calculationTrace,
        },
      });

      return `Calculated & saved PayrollRun ${run.id}: Gross=₹${run.totalGrossSalary}, Net=₹${run.totalNetPayout}, Line=${line.id}`;
    });

    // Step 7: Presence of Migration #31 & #32 Tables Transparent to Predecessor Code
    await runStep("7. Schema Coexistence", "Verify new tables exist without colliding", async () => {
      // Direct raw query to confirm Migration #31 and #32 tables exist in public schema
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('ProfessionalTaxRegistration', 'PtChallan', 'ComplianceCalendarObligation');
      `;

      if (tables.length < 3) {
        throw new Error(`Expected 3 migration #31/#32 tables, found ${tables.length}`);
      }

      // Query core table with JOIN to verify foreign key integrity
      const employeeCheck = await prisma.employee.findFirst({
        where: { id: testEmployeeId },
        include: { company: true, department: true, designation: true },
      });

      if (!employeeCheck) throw new Error("Employee join check failed");
      return `Verified coexistence of ${tables.map((t) => t.tablename).join(", ")}. Core schema joins unaffected.`;
    });

    console.log("\n=================================================================");
    console.log("  Rollback Compatibility Validation: ALL STEPS PASSED (100%)    ");
    console.log("=================================================================\n");
  } finally {
    // Step 8: Complete Reversible Cleanup
    console.log("Executing reversible cleanup of synthetic test data...");
    try {
      await prisma.payrollLine.deleteMany({ where: { payrollRun: { companyId: testCompanyId } } });
      await prisma.payrollAdjustment.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.payrollRun.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.expenseClaim.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.employee.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.user.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.designation.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.department.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.company.deleteMany({ where: { id: testCompanyId } });
      console.log("[SUCCESS] Synthetic test data completely purged. Zero residual footprint.");
    } catch (cleanupErr: any) {
      console.error("[WARNING] Cleanup encountered error:", cleanupErr.message);
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FATAL ERROR in Rollback Compatibility Suite:", e);
  process.exit(1);
});
