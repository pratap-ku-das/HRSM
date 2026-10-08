import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  evaluatePanState,
  calculateChallanLedger,
  aggregateQuarterlyDeductees,
  generateAnnexureTwo,
  generateEtdsFile,
} from "./compliance/tdsEngine.js";
import {
  StatutoryFilingFormatRegistry,
  Form24Q_Q1_Q3_Regular_v6_3,
  Form24Q_Q4_Regular_v7_5,
  Form138_Q1_Q3_Regular_v1_2,
  Form138_Q4_Regular_v1_0,
  type StatutorySpecification,
} from "./compliance/tdsFormatRegistry.js";
import { createTdsComplianceRouter } from "./compliance/tdsRoutes.js";

describe("OrbitHR P2.8 TDS Quarterly Compliance & Statutory Filing", () => {
  // ---------------------------------------------------------------------------
  // 1. STATUTORY SPECIFICATION REGISTRY & ANTI-GUESSING INVARIANT
  // ---------------------------------------------------------------------------
  describe("Statutory Filing Format Registry", () => {
    it("resolves Form 24Q v6.3 for FY 2025-26 Q1-Q3 Regular statements", () => {
      const spec = StatutoryFilingFormatRegistry.resolve("2025-26", "Q1", "REGULAR");
      expect(spec.formCode).toBe("24Q");
      expect(spec.formatVersion).toBe("6.3");
      expect(spec.annexureTwoRequired).toBe(false);
    });

    it("resolves Form 24Q v7.5 for FY 2025-26 Q4 Regular statements (Annexure II required)", () => {
      const spec = StatutoryFilingFormatRegistry.resolve("2025-26", "Q4", "REGULAR");
      expect(spec.formCode).toBe("24Q");
      expect(spec.formatVersion).toBe("7.5");
      expect(spec.annexureTwoRequired).toBe(true);
    });

    it("automatically transitions to Form 138 v1.2 for FY 2026-27 Q1-Q3 Regular statements", () => {
      const spec = StatutoryFilingFormatRegistry.resolve("2026-27", "Q2", "REGULAR");
      expect(spec.formCode).toBe("138");
      expect(spec.formatVersion).toBe("1.2");
      expect(spec.annexureTwoRequired).toBe(false);
    });

    it("resolves Form 138 v1.0 for FY 2026-27 Q4 Regular statements", () => {
      const spec = StatutoryFilingFormatRegistry.resolve("2026-27", "Q4", "REGULAR");
      expect(spec.formCode).toBe("138");
      expect(spec.formatVersion).toBe("1.0");
      expect(spec.annexureTwoRequired).toBe(true);
    });

    it("resolves Form 24Q v6.3 Correction statements requiring tokenNumberPrn", () => {
      const spec = StatutoryFilingFormatRegistry.resolve("2025-26", "Q1", "CORRECTION");
      expect(spec.formCode).toBe("24Q");
      expect(spec.statementType).toBe("CORRECTION");
      expect(spec.formatVersion).toBe("6.3");
    });

    it("resolves Form 138 v1.2 Correction statements for FY 2026-27 Q1-Q3", () => {
      const spec = StatutoryFilingFormatRegistry.resolve("2026-27", "Q2", "CORRECTION");
      expect(spec.formCode).toBe("138");
      expect(spec.statementType).toBe("CORRECTION");
      expect(spec.formatVersion).toBe("1.2");
    });

    it("explicitly distinguishes Statutory File Format != Protean RPU Version != Protean FVU Version", () => {
      const spec24Q = StatutoryFilingFormatRegistry.resolve("2025-26", "Q1", "REGULAR");
      expect(spec24Q.statutoryFileFormatVersion).toBe("6.3");
      expect(spec24Q.minRpuVersion).toBe("6.0");
      expect(spec24Q.minFvuVersion).toBe("8.8");
      expect(spec24Q.statutoryFileFormatVersion).not.toBe(spec24Q.minRpuVersion);
      expect(spec24Q.minRpuVersion).not.toBe(spec24Q.minFvuVersion);

      const spec138 = StatutoryFilingFormatRegistry.resolve("2026-27", "Q1", "REGULAR");
      expect(spec138.statutoryFileFormatVersion).toBe("1.2");
      expect(spec138.minRpuVersion).toBe("1.1");
      expect(spec138.minFvuVersion).toBe("1.0");
      expect(spec138.statutoryFileFormatVersion).not.toBe(spec138.minRpuVersion);
    });

    it("distinguishes Income-tax Act, 1961 (FY <= 2025-26) from Income-tax Act, 2025 (FY >= 2026-27)", () => {
      const specOld = StatutoryFilingFormatRegistry.resolve("2025-26", "Q1", "REGULAR");
      expect(specOld.applicableAct).toBe("Income-tax Act, 1961");
      expect(specOld.higherDeductionSection).toBe("Section 206AA");

      const specNew = StatutoryFilingFormatRegistry.resolve("2026-27", "Q1", "REGULAR");
      expect(specNew.applicableAct).toBe("Income-tax Act, 2025");
      expect(specNew.higherDeductionSection).toBe("Section 397");
    });

    it("enforces Anti-Guessing Invariant by halting on invalid or unregistered formats", () => {
      expect(() => {
        StatutoryFilingFormatRegistry.resolve("invalid-fy" as any, "Q1");
      }).toThrow(/INVALID_FINANCIAL_YEAR/);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. DEDUCTEE PAN LIFECYCLE & SECTION 206AA / 206AB STATUTORY RULES
  // ---------------------------------------------------------------------------
  describe("Deductee PAN Lifecycle & Statutory Flags", () => {
    it("identifies VALID PAN and assigns normal rate flag without penalty", () => {
      const res = evaluatePanState("ABCDE1234F");
      expect(res.state).toBe("VALID");
      expect(res.sanitizedPan).toBe("ABCDE1234F");
      expect(res.reasonCode).toBeNull();
    });

    it("identifies PANAPPLIED when Form 49A application proof is submitted", () => {
      const res = evaluatePanState(null, true);
      expect(res.state).toBe("PANAPPLIED");
      expect(res.sanitizedPan).toBe("PANAPPLIED");
      expect(res.reasonCode).toBeNull();
    });

    it("identifies PANNOTAVBL when missing and assigns Reason Code C (Section 206AA)", () => {
      const res = evaluatePanState(null, false);
      expect(res.state).toBe("PANNOTAVBL");
      expect(res.sanitizedPan).toBe("PANNOTAVBL");
      expect(res.reasonCode).toBe("C");
    });

    it("identifies PANINVALID for structurally malformed PAN and assigns Reason Code C", () => {
      const res = evaluatePanState("INVALID123", false);
      expect(res.state).toBe("PANINVALID");
      expect(res.sanitizedPan).toBe("PANINVALID");
      expect(res.reasonCode).toBe("C");
    });

    it("strictly omits Section 206AB Reason Code Y for FY 2025-26 onward (statutory omission)", () => {
      const profiles = new Map([
        [
          "emp-1",
          {
            employeeId: "emp-1",
            employeeCode: "EMP001",
            firstName: "John",
            lastName: "Doe",
            panNumber: null, // missing PAN
          },
        ],
      ]);

      const lines = [
        {
          employeeId: "emp-1",
          payrollRunMonth: "2025-04",
          payrollPeriodEnd: "2025-04-30",
          grossEarnings: 50000,
          tdsDeducted: 10000, // 20% rate
          breakdown: { TDS: 10000 },
        },
      ];

      const challans = [
        {
          id: "ch-1",
          bsrCode: "0210001",
          challanDate: "2025-05-07",
          challanSerialNo: "00001",
          minorHead: "200",
          tdsAmount: 10000,
          totalAmount: 10000,
        },
      ];

      const { deductees } = aggregateQuarterlyDeductees({
        financialYear: "2025-26",
        quarter: "Q1",
        monthlyLines: lines,
        employeeProfiles: profiles,
        challans,
      });

      expect(deductees).toHaveLength(1);
      expect(deductees[0].pan).toBe("PANNOTAVBL");
      expect(deductees[0].reasonCode).toBe("C"); // Section 206AA only
      expect(deductees[0].reasonCode).not.toBe("Y"); // Section 206AB omitted
    });

    it("emits validation warning when Section 206AA 20% floor is violated on missing PAN", () => {
      const profiles = new Map([
        [
          "emp-1",
          {
            employeeId: "emp-1",
            employeeCode: "EMP001",
            firstName: "Jane",
            lastName: "Smith",
            panNumber: null,
          },
        ],
      ]);

      const lines = [
        {
          employeeId: "emp-1",
          payrollRunMonth: "2025-04",
          payrollPeriodEnd: "2025-04-30",
          grossEarnings: 100000,
          tdsDeducted: 5000, // only 5% deducted instead of 20% floor
          breakdown: { TDS: 5000 },
        },
      ];

      const challans = [
        {
          id: "ch-1",
          bsrCode: "0210001",
          challanDate: "2025-05-07",
          challanSerialNo: "00001",
          minorHead: "200",
          tdsAmount: 5000,
          totalAmount: 5000,
        },
      ];

      const { validationWarnings } = aggregateQuarterlyDeductees({
        financialYear: "2025-26",
        quarter: "Q1",
        monthlyLines: lines,
        employeeProfiles: profiles,
        challans,
      });

      expect(validationWarnings.length).toBeGreaterThan(0);
      expect(validationWarnings[0]).toContain("Section 206AA Warning");
      expect(validationWarnings[0]).toContain("<20%");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. COMPONENT-LEVEL CHALLAN ALLOCATION & LEDGER RECONCILIATION
  // ---------------------------------------------------------------------------
  describe("Component-Level Challan Allocation & Ledger", () => {
    it("quarantines employer penalties (interest & fees) from allocatable tax pool", () => {
      const challans = [
        {
          id: "ch-1",
          bsrCode: "0210001",
          challanDate: "2025-05-07",
          challanSerialNo: "00001",
          minorHead: "200",
          tdsAmount: 50000,
          surcharge: 2000,
          cess: 2080,
          interest: 1500, // Employer penalty u/s 201(1A)
          fee: 400, // Employer late fee u/s 234E
          totalAmount: 55980,
        },
      ];

      const allocations = [{ challanSerialNo: "00001", tdsAmount: 54080 }];

      const ledger = calculateChallanLedger(challans, allocations);
      expect(ledger.totalAllocatableChallanDeposit).toBe(54080); // 50000 + 2000 + 2080
      expect(ledger.totalEmployerPenaltiesDeposit).toBe(1900); // 1500 + 400
      expect(ledger.totalChallanDeposited).toBe(55980);
      expect(ledger.reconciliationStatus).toBe("FULLY_RECONCILED");
      expect(ledger.blockingErrors).toHaveLength(0);
    });

    it("permits EXCESS_CHALLAN_SURPLUS when deposited tax exceeds allocated deductee tax", () => {
      const challans = [
        {
          id: "ch-1",
          bsrCode: "0210001",
          challanDate: "2025-05-07",
          challanSerialNo: "00001",
          minorHead: "200",
          tdsAmount: 60000,
          totalAmount: 60000,
        },
      ];

      const allocations = [{ challanSerialNo: "00001", tdsAmount: 50000 }];

      const ledger = calculateChallanLedger(challans, allocations);
      expect(ledger.reconciliationStatus).toBe("EXCESS_CHALLAN_SURPLUS");
      expect(ledger.totalUnallocatedSurplus).toBe(10000);
      expect(ledger.blockingErrors).toHaveLength(0);
    });

    it("blocks SHORT_PAYMENT_BLOCKED when allocated deductee tax exceeds challan capacity", () => {
      const challans = [
        {
          id: "ch-1",
          bsrCode: "0210001",
          challanDate: "2025-05-07",
          challanSerialNo: "00001",
          minorHead: "200",
          tdsAmount: 40000,
          totalAmount: 40000,
        },
      ];

      const allocations = [{ challanSerialNo: "00001", tdsAmount: 45000 }];

      const ledger = calculateChallanLedger(challans, allocations);
      expect(ledger.reconciliationStatus).toBe("SHORT_PAYMENT_BLOCKED");
      expect(ledger.blockingErrors.length).toBeGreaterThan(0);
      expect(ledger.blockingErrors[0]).toContain("is underfunded");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. QUARTER 4 ANNEXURE II SALARY CONSOLIDATION
  // ---------------------------------------------------------------------------
  describe("Annexure II Annual Salary Consolidation (Q4)", () => {
    it("correctly computes 12-month annual salary summary, Chapter VI-A, and tax payable", () => {
      const employees = [
        {
          employeeId: "emp-1",
          employeeCode: "EMP001",
          firstName: "Alice",
          lastName: "Walker",
          panNumber: "ABCDE1234F",
        },
      ];

      const salaryRecords = new Map([
        [
          "emp-1",
          {
            periodStart: "2025-04-01",
            periodEnd: "2026-03-31",
            regime: "NEW" as const,
            grossSalarySec17_1: 1200000,
            perquisitesSec17_2: 0,
            profitsInLieuSec17_3: 0,
            previousEmployerSalary: 0,
            exemptionsSec10: 0,
            standardDeduction: 75000, // Budget 2025 standard deduction
            professionalTax: 2500,
            chapterVIA: 0, // No Chapter VI-A under new regime
            taxableIncome: 1122500,
            taxPayable: 62250,
            rebate87A: 60000, // 87A rebate
            cess: 90,
            relief89: 0,
            totalTdsCurrentEmployer: 2340,
            totalTdsPreviousEmployer: 0,
          },
        ],
      ]);

      const annexureTwo = generateAnnexureTwo({
        financialYear: "2025-26",
        employees,
        annualSalaryRecords: salaryRecords,
      });

      expect(annexureTwo).toHaveLength(1);
      const item = annexureTwo[0];
      expect(item.employeeCode).toBe("EMP001");
      expect(item.pan).toBe("ABCDE1234F");
      expect(item.regime).toBe("NEW");
      expect(item.totalGrossSalary).toBe(1200000);
      expect(item.deductionsSec16.standardDeduction).toBe(75000);
      expect(item.totalTaxableIncome).toBe(1122500);
      expect(item.totalTdsDeducted).toBe(2340);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. OFFICIAL e-TDS RETURN SERIALIZATION (.txt)
  // ---------------------------------------------------------------------------
  describe("Official e-TDS Return ASCII Export", () => {
    it("generates valid Form 24Q ASCII format with FH, BH, CD, and DD records", () => {
      const payload = {
        deductor: {
          tan: "BLRE12345F",
          pan: "ABCDE1234F",
          financialYear: "2025-26",
          assessmentYear: "2026-27",
          quarter: "Q1" as const,
          legalEntityName: "Acme Enterprise Corp",
          registeredAddress: "100 MG Road",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          officialEmail: "tax@acme.com",
          officialPhone: "9876543210",
          responsiblePersonName: "Rajesh Kumar",
          responsiblePersonDesignation: "CFO",
          responsiblePersonPan: "ABCDE5678G",
          responsiblePersonMobile: "9876543210",
          responsiblePersonEmail: "cfo@acme.com",
        },
        challans: [
          {
            challanIndex: 1,
            bsrCode: "0210001",
            challanDate: "2025-05-07",
            challanSerialNo: "00001",
            minorHead: "200",
            tdsAmount: 15000,
            surcharge: 0,
            cess: 0,
            interest: 0,
            fee: 0,
            totalAmount: 15000,
            allocatedDeducteeCount: 1,
          },
        ],
        deductees: [
          {
            deducteeIndex: 1,
            challanSerialNo: "00001",
            employeeCode: "EMP001",
            employeeName: "Suresh Sharma",
            pan: "AAAAA1111A",
            panStatus: "VALID" as const,
            paymentDate: "2025-04-30",
            grossPayment: 100000,
            tdsDeducted: 15000,
            surcharge: 0,
            cess: 0,
            totalTdsDeducted: 15000,
            totalTdsDeposited: 15000,
            deductionDate: "2025-04-30",
            rateOfTds: 15,
            reasonCode: null,
          },
        ],
      };

      const result = generateEtdsFile(payload);
      expect(result.preconditionErrors).toHaveLength(0);
      expect(result.formCode).toBe("24Q");
      expect(result.formatVersion).toBe("6.3");

      const lines = result.asciiText.split("\r\n");
      expect(lines[0]).toContain("FH^SL1^24Q^6.3");
      expect(lines[1]).toContain("BH^1^1^24Q");
      expect(lines[2]).toContain("CD^1^1^1^N^^^0210001");
      expect(lines[3]).toContain("DD^1^1^1^O^02^AAAAA1111A");
    });

    it("generates valid Form 138 ASCII format for FY 2026-27 onward", () => {
      const payload = {
        deductor: {
          tan: "BLRE12345F",
          pan: "ABCDE1234F",
          financialYear: "2026-27",
          assessmentYear: "2027-28",
          quarter: "Q1" as const,
          legalEntityName: "Acme Enterprise Corp",
          registeredAddress: "100 MG Road",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          officialEmail: "tax@acme.com",
          officialPhone: "9876543210",
          responsiblePersonName: "Rajesh Kumar",
          responsiblePersonDesignation: "CFO",
          responsiblePersonPan: "ABCDE5678G",
          responsiblePersonMobile: "9876543210",
          responsiblePersonEmail: "cfo@acme.com",
        },
        challans: [
          {
            challanIndex: 1,
            bsrCode: "0210001",
            challanDate: "2026-05-07",
            challanSerialNo: "00001",
            minorHead: "200",
            tdsAmount: 20000,
            surcharge: 0,
            cess: 0,
            interest: 0,
            fee: 0,
            totalAmount: 20000,
            allocatedDeducteeCount: 1,
          },
        ],
        deductees: [
          {
            deducteeIndex: 1,
            challanSerialNo: "00001",
            employeeCode: "EMP001",
            employeeName: "Suresh Sharma",
            pan: "AAAAA1111A",
            panStatus: "VALID" as const,
            paymentDate: "2026-04-30",
            grossPayment: 150000,
            tdsDeducted: 20000,
            surcharge: 0,
            cess: 0,
            totalTdsDeducted: 20000,
            totalTdsDeposited: 20000,
            deductionDate: "2026-04-30",
            rateOfTds: 13.33,
            reasonCode: null,
          },
        ],
      };

      const result = generateEtdsFile(payload);
      expect(result.preconditionErrors).toHaveLength(0);
      expect(result.formCode).toBe("138");
      expect(result.formatVersion).toBe("1.2");

      const lines = result.asciiText.split("\r\n");
      expect(lines[0]).toContain("FH^SL1^138^1.2");
      expect(lines[1]).toContain("BH^1^1^138");
    });

    it("generates valid Form 24Q Correction ASCII return containing 'C' indicator and original PRN token", () => {
      const correctionPayload = {
        deductor: {
          tan: "BLRE12345F",
          pan: "ABCDE1234F",
          financialYear: "2025-26",
          assessmentYear: "2026-27",
          quarter: "Q1" as const,
          legalEntityName: "Acme Corporation",
          registeredAddress: "Tech Park, Outer Ring Road",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560103",
          officialEmail: "finance@acme.com",
          officialPhone: "08012345678",
          responsiblePersonName: "Rajesh Kumar",
          responsiblePersonDesignation: "Chief Financial Officer",
          responsiblePersonPan: "ABCDE5678G",
          responsiblePersonMobile: "9876543210",
          responsiblePersonEmail: "cfo@acme.com",
          tokenNumberPrn: "010010203040506", // Original PRN mandatory for correction
        },
        challans: [
          {
            challanIndex: 1,
            bsrCode: "0210001",
            challanDate: "2025-05-07",
            challanSerialNo: "00001",
            minorHead: "200",
            tdsAmount: 15000,
            surcharge: 0,
            cess: 0,
            interest: 0,
            fee: 0,
            totalAmount: 15000,
            allocatedDeducteeCount: 1,
          },
        ],
        deductees: [
          {
            deducteeIndex: 1,
            challanSerialNo: "00001",
            employeeCode: "EMP001",
            employeeName: "Jane Doe",
            pan: "AAAAA1111A",
            panStatus: "VALID" as const,
            paymentDate: "2025-04-30",
            grossPayment: 150000,
            tdsDeducted: 15000,
            surcharge: 0,
            cess: 0,
            totalTdsDeducted: 15000,
            totalTdsDeposited: 15000,
            deductionDate: "2025-04-30",
            rateOfTds: 10,
            reasonCode: null,
          },
        ],
      };

      const result = generateEtdsFile(correctionPayload);
      expect(result.preconditionErrors).toHaveLength(0);
      expect(result.formCode).toBe("24Q");
      expect(result.formatVersion).toBe("6.3");

      const lines = result.asciiText.split("\r\n");
      const batchLine = lines[1];
      expect(batchLine).toContain("^C^010010203040506^");
    });

    it("generates valid Form 138 Correction ASCII return containing 'C' indicator and original PRN token", () => {
      const correctionPayload138 = {
        deductor: {
          tan: "BLRE12345F",
          pan: "ABCDE1234F",
          financialYear: "2026-27",
          assessmentYear: "2027-28",
          quarter: "Q2" as const,
          legalEntityName: "Acme Corporation",
          registeredAddress: "Tech Park, Outer Ring Road",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560103",
          officialEmail: "finance@acme.com",
          officialPhone: "08012345678",
          responsiblePersonName: "Rajesh Kumar",
          responsiblePersonDesignation: "Chief Financial Officer",
          responsiblePersonPan: "ABCDE5678G",
          responsiblePersonMobile: "9876543210",
          responsiblePersonEmail: "cfo@acme.com",
          tokenNumberPrn: "020010203040506",
        },
        challans: [
          {
            challanIndex: 1,
            bsrCode: "0210001",
            challanDate: "2026-08-07",
            challanSerialNo: "00002",
            minorHead: "200",
            tdsAmount: 18000,
            surcharge: 0,
            cess: 0,
            interest: 0,
            fee: 0,
            totalAmount: 18000,
            allocatedDeducteeCount: 1,
          },
        ],
        deductees: [
          {
            deducteeIndex: 1,
            challanSerialNo: "00002",
            employeeCode: "EMP002",
            employeeName: "Rohan Varma",
            pan: "BBBBB2222B",
            panStatus: "VALID" as const,
            paymentDate: "2026-07-31",
            grossPayment: 180000,
            tdsDeducted: 18000,
            surcharge: 0,
            cess: 0,
            totalTdsDeducted: 18000,
            totalTdsDeposited: 18000,
            deductionDate: "2026-07-31",
            rateOfTds: 10,
            reasonCode: null,
          },
        ],
      };

      const result = generateEtdsFile(correctionPayload138);
      expect(result.preconditionErrors).toHaveLength(0);
      expect(result.formCode).toBe("138");
      expect(result.formatVersion).toBe("1.2");

      const lines = result.asciiText.split("\r\n");
      const batchLine = lines[1];
      expect(batchLine).toContain("^C^020010203040506^");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. MAKER-CHECKER SEGREGATION OF DUTIES & LIFECYCLE
  // ---------------------------------------------------------------------------
  describe("TDS Lifecycle & Maker-Checker SoD API", () => {
    let mockPrisma: any;
    let mockFilings: any[];
    let mockChallans: any[];
    let mockItems: any[];
    let mockSettings: any;

    beforeEach(() => {
      mockFilings = [];
      mockChallans = [];
      mockItems = [];
      mockSettings = {
        companyId: "comp-1",
        tanNumber: "BLRE12345F",
        panNumber: "ABCDE1234F",
        legalEntityName: "Acme Corp",
      };

      mockPrisma = {
        companySettings: {
          findUnique: vi.fn(async ({ where }: any) =>
            where.companyId === mockSettings.companyId ? mockSettings : null
          ),
        },
        company: {
          findUnique: vi.fn(async ({ where }: any) => ({
            id: where.id,
            name: "Acme Corp",
          })),
        },
        tdsChallan: {
          findMany: vi.fn(async () => mockChallans),
        },
        statutoryFiling: {
          findFirst: vi.fn(async ({ where }: any) =>
            mockFilings.find((f) => f.id === where.id && f.companyId === where.companyId) || null
          ),
          create: vi.fn(async ({ data }: any) => {
            const row = { id: `filing-${mockFilings.length + 1}`, ...data };
            mockFilings.push(row);
            return row;
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const idx = mockFilings.findIndex((f) => f.id === where.id);
            if (idx === -1) throw new Error("Not found");
            mockFilings[idx] = { ...mockFilings[idx], ...data };
            return mockFilings[idx];
          }),
        },
        statutoryFilingItem: {
          create: vi.fn(async ({ data }: any) => {
            const row = { id: `item-${mockItems.length + 1}`, ...data };
            mockItems.push(row);
            return row;
          }),
        },
        auditLog: {
          create: vi.fn(async () => ({})),
        },
      };
    });

    const createTestApp = (authOverrides: Record<string, any> = {}) => {
      const app = express();
      app.use(express.json());

      const authMiddleware = (req: any, _res: any, next: any) => {
        req.auth = {
          id: "maker-1",
          companyId: "comp-1",
          role: "COMPANY_ADMIN",
          permissions: ["compliance.manage", "compliance.approve"],
          ...authOverrides,
        };
        next();
      };

      app.use(createTdsComplianceRouter(mockPrisma, authMiddleware));
      return app;
    };

    it("enforces Maker-Checker SoD: Maker cannot approve their own filing", async () => {
      const filing = {
        id: "filing-001",
        companyId: "comp-1",
        createdById: "maker-1", // Created by maker-1
        status: "PENDING_APPROVAL",
        domain: "TDS_24Q",
        statutoryFormCode: "24Q",
      };
      mockFilings.push(filing);

      // 1. Maker attempts self-approval
      const makerApp = createTestApp({ id: "maker-1" });
      const failRes = await request(makerApp).post("/compliance/tds/filings/filing-001/approve");
      expect(failRes.status).toBe(403);
      expect(failRes.body.error.code).toBe("MAKER_CANNOT_APPROVE");

      // 2. Checker approves successfully
      const checkerApp = createTestApp({ id: "checker-1" });
      const okRes = await request(checkerApp).post("/compliance/tds/filings/filing-001/approve");
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.status).toBe("APPROVED");
      expect(okRes.body.data.approvedById).toBe("checker-1");
    });

    it("generates SHA-256 seal and locks filing into immutable state", async () => {
      const filing = {
        id: "filing-002",
        companyId: "comp-1",
        createdById: "maker-1",
        approvedById: "checker-1",
        status: "APPROVED",
        domain: "TDS_24Q",
        statutoryFormCode: "24Q",
        periodYear: 2025,
        quarter: "Q1",
        totalEmployees: 1,
        totalGrossWages: 100000,
        totalTaxDeducted: 10000,
        items: [],
        challans: [],
      };
      mockFilings.push(filing);

      const checkerApp = createTestApp({ id: "checker-1" });
      const lockRes = await request(checkerApp).post("/compliance/tds/filings/filing-002/lock");
      expect(lockRes.status).toBe(200);
      expect(lockRes.body.data.status).toBe("LOCKED");
      expect(lockRes.body.data.sha256Checksum).toHaveLength(64); // 64-char hex SHA-256
    });

    it("records ITD Provisional Receipt Number (PRN / Token Number) post-filing", async () => {
      const filing = {
        id: "filing-003",
        companyId: "comp-1",
        status: "EXPORTED",
      };
      mockFilings.push(filing);

      const app = createTestApp({ id: "maker-1" });
      const res = await request(app)
        .post("/compliance/tds/filings/filing-003/record-token")
        .send({
          tokenNumberPrn: "010020304050607",
          receiptDate: "2025-07-25",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.tokenNumberPrn).toBe("010020304050607");
    });

    it("strictly enforces Tenant Isolation: Company A filing cannot be viewed, approved, or exported by Company B", async () => {
      const filingCompA = {
        id: "filing-compA-001",
        companyId: "comp-A",
        createdById: "maker-A",
        status: "PENDING_APPROVAL",
        domain: "TDS_24Q",
        statutoryFormCode: "24Q",
      };
      mockFilings.push(filingCompA);

      // User from Company B attempts to approve Company A filing
      const compBApp = createTestApp({
        companyId: "comp-B",
        id: "checker-B",
      });

      const res = await request(compBApp).post("/compliance/tds/filings/filing-compA-001/approve");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("FILING_NOT_FOUND");
    });

    it("strictly enforces Permission Isolation: compliance.manage cannot approve, compliance.approve cannot record tokens", async () => {
      const filing = {
        id: "filing-perm-001",
        companyId: "comp-1",
        createdById: "maker-other",
        status: "PENDING_APPROVAL",
        domain: "TDS_24Q",
        statutoryFormCode: "24Q",
      };
      mockFilings.push(filing);

      // 1. User with ONLY compliance.manage (no compliance.approve)
      const manageOnlyApp = createTestApp({
        role: "COMPLIANCE_MAKER",
        permissions: ["compliance.manage"],
      });
      const approveRes = await request(manageOnlyApp).post("/compliance/tds/filings/filing-perm-001/approve");
      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error.code).toBe("FORBIDDEN");
      expect(approveRes.body.error.message).toContain("compliance.approve");

      // 2. User with ONLY compliance.approve (no compliance.manage)
      filing.status = "EXPORTED";
      const approveOnlyApp = createTestApp({
        role: "COMPLIANCE_CHECKER",
        permissions: ["compliance.approve"],
      });
      const tokenRes = await request(approveOnlyApp)
        .post("/compliance/tds/filings/filing-perm-001/record-token")
        .send({ tokenNumberPrn: "999888777666", receiptDate: "2025-08-01" });
      expect(tokenRes.status).toBe(403);
      expect(tokenRes.body.error.code).toBe("FORBIDDEN");
      expect(tokenRes.body.error.message).toContain("compliance.manage");
    });

    it("enforces State Idempotency: duplicate PRN recording and duplicate lock requests are handled safely", async () => {
      const filing = {
        id: "filing-idemp-001",
        companyId: "comp-1",
        status: "EXPORTED",
        tokenNumberPrn: "ORIGINAL_TOKEN_1",
      };
      mockFilings.push(filing);

      const app = createTestApp({ id: "maker-1" });

      // First token record
      const res1 = await request(app)
        .post("/compliance/tds/filings/filing-idemp-001/record-token")
        .send({ tokenNumberPrn: "UPDATED_TOKEN_2", receiptDate: "2025-07-28" });
      expect(res1.status).toBe(200);
      expect(res1.body.data.tokenNumberPrn).toBe("UPDATED_TOKEN_2");

      // Re-recording is safe and idempotent
      const res2 = await request(app)
        .post("/compliance/tds/filings/filing-idemp-001/record-token")
        .send({ tokenNumberPrn: "UPDATED_TOKEN_2", receiptDate: "2025-07-28" });
      expect(res2.status).toBe(200);
      expect(res2.body.data.tokenNumberPrn).toBe("UPDATED_TOKEN_2");
    });

    it("prevents double-approval under concurrency: second checker attempt fails with 409 Conflict", async () => {
      const filing = {
        id: "filing-concurrent-001",
        companyId: "comp-1",
        createdById: "maker-1",
        status: "PENDING_APPROVAL",
        domain: "TDS_24Q",
        statutoryFormCode: "24Q",
      };
      mockFilings.push(filing);

      const checker1App = createTestApp({ id: "checker-1" });
      const checker2App = createTestApp({ id: "checker-2" });

      // Checker 1 approves
      const res1 = await request(checker1App).post("/compliance/tds/filings/filing-concurrent-001/approve");
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe("APPROVED");

      // Checker 2 simultaneously attempts to approve the now APPROVED filing
      const res2 = await request(checker2App).post("/compliance/tds/filings/filing-concurrent-001/approve");
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe("INVALID_STATUS");
      expect(res2.body.error.message).toContain("Current status: APPROVED");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. TDS CHALLAN ALLOCATION & INVARIANTS (MIGRATION #30)
  // ---------------------------------------------------------------------------
  describe("TDS Challan Allocation & Invariants (Migration #30)", () => {
    let mockPrisma: any;
    let mockFilings: any[];
    let mockChallans: any[];
    let mockItems: any[];
    let mockAllocations: any[];

    beforeEach(() => {
      mockFilings = [];
      mockChallans = [];
      mockItems = [];
      mockAllocations = [];

      mockPrisma = {
        statutoryFiling: {
          findFirst: vi.fn(async ({ where }: any) =>
            mockFilings.find((f) => f.id === where.id && f.companyId === where.companyId) || null
          ),
        },
        statutoryFilingItem: {
          findUnique: vi.fn(async ({ where }: any) =>
            mockItems.find((i) => i.id === where.id) || null
          ),
        },
        tdsChallan: {
          findFirst: vi.fn(async ({ where }: any) =>
            mockChallans.find((c) => c.id === where.id && c.companyId === where.companyId) || null
          ),
        },
        tdsChallanAllocation: {
          findMany: vi.fn(async ({ where }: any) => {
            return mockAllocations.filter((a) => {
              if (where.statutoryFilingId && a.statutoryFilingId !== where.statutoryFilingId) return false;
              if (where.companyId && a.companyId !== where.companyId) return false;
              if (where.tdsChallanId && a.tdsChallanId !== where.tdsChallanId) return false;
              if (where.NOT?.statutoryFilingItemId && a.statutoryFilingItemId === where.NOT.statutoryFilingItemId) return false;
              return true;
            });
          }),
          upsert: vi.fn(async ({ where, create, update }: any) => {
            const idx = mockAllocations.findIndex(
              (a) =>
                a.statutoryFilingItemId === where.statutoryFilingItemId_tdsChallanId.statutoryFilingItemId &&
                a.tdsChallanId === where.statutoryFilingItemId_tdsChallanId.tdsChallanId
            );
            if (idx !== -1) {
              mockAllocations[idx] = { ...mockAllocations[idx], ...update };
              return mockAllocations[idx];
            }
            const row = { id: `alloc-${mockAllocations.length + 1}`, ...create };
            mockAllocations.push(row);
            return row;
          }),
        },
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
        auditLog: {
          create: vi.fn(async () => ({})),
        },
      };
    });

    const createTestApp = (authOverrides: Record<string, any> = {}) => {
      const app = express();
      app.use(express.json());

      const authMiddleware = (req: any, _res: any, next: any) => {
        req.auth = {
          id: "maker-1",
          companyId: "comp-1",
          role: "COMPANY_ADMIN",
          permissions: ["COMPLIANCE_VIEW", "COMPLIANCE_EXECUTE"],
          ...authOverrides,
        };
        next();
      };

      app.use(createTdsComplianceRouter(mockPrisma, authMiddleware));
      return app;
    };

    it("A. supports M:N allocation: 1 filing item funded by 3 monthly challans", async () => {
      mockFilings.push({ id: "filing-mn-1", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-emp-1", filingId: "filing-mn-1", snapshotEmployeeCode: "EMP01" });
      mockChallans.push(
        { id: "ch-apr", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 5000 },
        { id: "ch-may", companyId: "comp-1", challanSerialNo: "00002", tdsAmount: 5000 },
        { id: "ch-jun", companyId: "comp-1", challanSerialNo: "00003", tdsAmount: 5000 }
      );

      const app = createTestApp();
      const r1 = await request(app).post("/compliance/tds/filings/filing-mn-1/allocations").send({
        statutoryFilingItemId: "item-emp-1",
        tdsChallanId: "ch-apr",
        allocatedTds: 5000,
      });
      const r2 = await request(app).post("/compliance/tds/filings/filing-mn-1/allocations").send({
        statutoryFilingItemId: "item-emp-1",
        tdsChallanId: "ch-may",
        allocatedTds: 5000,
      });
      const r3 = await request(app).post("/compliance/tds/filings/filing-mn-1/allocations").send({
        statutoryFilingItemId: "item-emp-1",
        tdsChallanId: "ch-jun",
        allocatedTds: 5000,
      });

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect(r3.status).toBe(201);
      expect(mockAllocations).toHaveLength(3);
    });

    it("B. supports many-to-one allocation: multiple filing items funded by 1 bulk challan", async () => {
      mockFilings.push({ id: "filing-m1-1", companyId: "comp-1", status: "DRAFT" });
      mockItems.push(
        { id: "item-1", filingId: "filing-m1-1", snapshotEmployeeCode: "E1" },
        { id: "item-2", filingId: "filing-m1-1", snapshotEmployeeCode: "E2" }
      );
      mockChallans.push({ id: "ch-bulk", companyId: "comp-1", challanSerialNo: "00010", tdsAmount: 20000 });

      const app = createTestApp();
      const r1 = await request(app).post("/compliance/tds/filings/filing-m1-1/allocations").send({
        statutoryFilingItemId: "item-1",
        tdsChallanId: "ch-bulk",
        allocatedTds: 10000,
      });
      const r2 = await request(app).post("/compliance/tds/filings/filing-m1-1/allocations").send({
        statutoryFilingItemId: "item-2",
        tdsChallanId: "ch-bulk",
        allocatedTds: 10000,
      });

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect(mockAllocations).toHaveLength(2);
    });

    it("C. enforces tenant isolation: cross-company filing/challan allocation rejected with 403", async () => {
      mockFilings.push({ id: "filing-c1", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-c1", filingId: "filing-c1", snapshotEmployeeCode: "E1" });
      mockChallans.push({ id: "ch-other-comp", companyId: "comp-2", challanSerialNo: "00099", tdsAmount: 10000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-c1/allocations").send({
        statutoryFilingItemId: "item-c1",
        tdsChallanId: "ch-other-comp",
        allocatedTds: 5000,
      });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("TENANT_MISMATCH");
    });

    it("D. enforces filing consistency: allocation statutoryFilingId != filingItem.filingId rejected with 422", async () => {
      mockFilings.push(
        { id: "filing-A", companyId: "comp-1", status: "DRAFT" },
        { id: "filing-B", companyId: "comp-1", status: "DRAFT" }
      );
      // item belongs to filing-B, but request targets filing-A
      mockItems.push({ id: "item-B", filingId: "filing-B", snapshotEmployeeCode: "EB" });
      mockChallans.push({ id: "ch-1", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 10000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-A/allocations").send({
        statutoryFilingItemId: "item-B",
        tdsChallanId: "ch-1",
        allocatedTds: 5000,
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("FILING_MISMATCH");
    });

    it("E. rejects negative monetary values with 400 validation error", async () => {
      mockFilings.push({ id: "filing-neg", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-neg", filingId: "filing-neg", snapshotEmployeeCode: "EN" });
      mockChallans.push({ id: "ch-neg", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 10000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-neg/allocations").send({
        statutoryFilingItemId: "item-neg",
        tdsChallanId: "ch-neg",
        allocatedTds: -100,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("F. rejects decimal precision violations under Option B (10.123 and 10.005)", async () => {
      mockFilings.push({ id: "filing-prec", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-prec", filingId: "filing-prec", snapshotEmployeeCode: "EP" });
      mockChallans.push({ id: "ch-prec", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 10000 });

      const app = createTestApp();
      const r1 = await request(app).post("/compliance/tds/filings/filing-prec/allocations").send({
        statutoryFilingItemId: "item-prec",
        tdsChallanId: "ch-prec",
        allocatedTds: 10.123,
      });
      expect(r1.status).toBe(422);
      expect(r1.body.error.code).toBe("INVALID_PRECISION");

      const r2 = await request(app).post("/compliance/tds/filings/filing-prec/allocations").send({
        statutoryFilingItemId: "item-prec",
        tdsChallanId: "ch-prec",
        allocatedTds: 10.005,
      });
      expect(r2.status).toBe(422);
      expect(r2.body.error.code).toBe("INVALID_PRECISION");
    });

    it("G. rejects component total mismatch (100 + 10 + 5 != 114)", async () => {
      mockFilings.push({ id: "filing-sum", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-sum", filingId: "filing-sum", snapshotEmployeeCode: "ES" });
      mockChallans.push({ id: "ch-sum", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 10000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-sum/allocations").send({
        statutoryFilingItemId: "item-sum",
        tdsChallanId: "ch-sum",
        allocatedTds: 100,
        allocatedSurcharge: 10,
        allocatedCess: 5,
        allocatedTotal: 114, // Expected: 115
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("SUM_MISMATCH");
    });

    it("H. rejects allocation exceeding challan capacity with 422 CHALLAN_OVERALLOCATED", async () => {
      mockFilings.push({ id: "filing-cap", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-cap", filingId: "filing-cap", snapshotEmployeeCode: "EC" });
      mockChallans.push({ id: "ch-cap", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 5000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-cap/allocations").send({
        statutoryFilingItemId: "item-cap",
        tdsChallanId: "ch-cap",
        allocatedTds: 6000, // Exceeds 5000
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("CHALLAN_OVERALLOCATED");
    });

    it("I. prevents duplicate item/challan allocation via upsert invariant", async () => {
      mockFilings.push({ id: "filing-dup", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-dup", filingId: "filing-dup", snapshotEmployeeCode: "ED" });
      mockChallans.push({ id: "ch-dup", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 10000 });

      const app = createTestApp();
      const r1 = await request(app).post("/compliance/tds/filings/filing-dup/allocations").send({
        statutoryFilingItemId: "item-dup",
        tdsChallanId: "ch-dup",
        allocatedTds: 2000,
      });
      expect(r1.status).toBe(201);
      expect(mockAllocations).toHaveLength(1);

      // Re-posting same (item, challan) updates rather than duplicating
      const r2 = await request(app).post("/compliance/tds/filings/filing-dup/allocations").send({
        statutoryFilingItemId: "item-dup",
        tdsChallanId: "ch-dup",
        allocatedTds: 3000,
      });
      expect(r2.status).toBe(201);
      expect(mockAllocations).toHaveLength(1);
      expect(mockAllocations[0].allocatedTds).toBe(3000);
    });

    it("J. rejects export when deductee has panStatus = 'NOT_APPLICABLE' with 422 DEDUCTEE_PAN_UNVERIFIED", async () => {
      mockFilings.push({
        id: "filing-unver-1",
        companyId: "comp-1",
        status: "APPROVED",
        domain: "TDS_24Q",
        statutoryFormCode: "24Q",
        items: [
          {
            snapshotEmployeeCode: "E_NA",
            snapshotEmployeeName: "Non Verified User",
            panStatus: "NOT_APPLICABLE",
          },
        ],
        challans: [],
      });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-unver-1/export");
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("DEDUCTEE_PAN_UNVERIFIED");
    });

    it("K. rejects export when deductee has panStatus = 'UNKNOWN' with 422 DEDUCTEE_PAN_UNVERIFIED", async () => {
      mockFilings.push({
        id: "filing-unver-2",
        companyId: "comp-1",
        status: "APPROVED",
        domain: "TDS_24Q",
        statutoryFormCode: "24Q",
        items: [
          {
            snapshotEmployeeCode: "E_UNK",
            snapshotEmployeeName: "Unknown User",
            panStatus: "UNKNOWN",
          },
        ],
        challans: [],
      });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-unver-2/export");
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("DEDUCTEE_PAN_UNVERIFIED");
    });

    it("L. protects LOCKED and EXPORTED filings: allocation mutations return 409 FILING_LOCKED", async () => {
      mockFilings.push(
        { id: "filing-lock", companyId: "comp-1", status: "LOCKED" },
        { id: "filing-exp", companyId: "comp-1", status: "EXPORTED" }
      );
      mockItems.push(
        { id: "item-l", filingId: "filing-lock", snapshotEmployeeCode: "EL" },
        { id: "item-e", filingId: "filing-exp", snapshotEmployeeCode: "EE" }
      );
      mockChallans.push({ id: "ch-lock", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 10000 });

      const app = createTestApp();
      const r1 = await request(app).post("/compliance/tds/filings/filing-lock/allocations").send({
        statutoryFilingItemId: "item-l",
        tdsChallanId: "ch-lock",
        allocatedTds: 1000,
      });
      expect(r1.status).toBe(409);
      expect(r1.body.error.code).toBe("FILING_LOCKED");

      const r2 = await request(app).post("/compliance/tds/filings/filing-exp/allocations").send({
        statutoryFilingItemId: "item-e",
        tdsChallanId: "ch-lock",
        allocatedTds: 1000,
      });
      expect(r2.status).toBe(409);
      expect(r2.body.error.code).toBe("FILING_LOCKED");
    });

    it("M. preserves correction isolation: revising an allocation does not mutate locked original filings", async () => {
      // Original filing locked
      mockFilings.push({ id: "filing-orig", companyId: "comp-1", status: "LOCKED" });
      mockItems.push({ id: "item-orig", filingId: "filing-orig", snapshotEmployeeCode: "E_CORR" });
      mockAllocations.push({
        id: "alloc-orig",
        companyId: "comp-1",
        statutoryFilingId: "filing-orig",
        tdsChallanId: "ch-corr",
        statutoryFilingItemId: "item-orig",
        allocatedTds: 5000,
        allocatedTotal: 5000,
      });

      // Correction filing in DRAFT
      mockFilings.push({
        id: "filing-revised",
        companyId: "comp-1",
        status: "DRAFT",
        supersededFilingId: "filing-orig",
      });
      mockItems.push({ id: "item-revised", filingId: "filing-revised", snapshotEmployeeCode: "E_CORR" });
      mockChallans.push({ id: "ch-corr", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 15000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-revised/allocations").send({
        statutoryFilingItemId: "item-revised",
        tdsChallanId: "ch-corr",
        allocatedTds: 6000,
      });

      expect(res.status).toBe(201);
      // Original allocation is completely preserved
      const origAlloc = mockAllocations.find((a) => a.id === "alloc-orig");
      expect(origAlloc.allocatedTds).toBe(5000);
      expect(origAlloc.statutoryFilingId).toBe("filing-orig");
      // Revised allocation is created under filing-revised
      const revAlloc = mockAllocations.find((a) => a.statutoryFilingId === "filing-revised");
      expect(revAlloc.allocatedTds).toBe(6000);
    });

    it("N. accepts valid 10.00 allocation", async () => {
      mockFilings.push({ id: "filing-n", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-n", filingId: "filing-n", snapshotEmployeeCode: "EN" });
      mockChallans.push({ id: "ch-n", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 1000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-n/allocations").send({
        statutoryFilingItemId: "item-n",
        tdsChallanId: "ch-n",
        allocatedTds: 10.0,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.allocatedTds).toBe(10.0);
    });

    it("O. accepts valid 10.50 allocation", async () => {
      mockFilings.push({ id: "filing-o", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-o", filingId: "filing-o", snapshotEmployeeCode: "EO" });
      mockChallans.push({ id: "ch-o", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 1000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-o/allocations").send({
        statutoryFilingItemId: "item-o",
        tdsChallanId: "ch-o",
        allocatedTds: 10.5,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.allocatedTds).toBe(10.5);
    });

    it("P. rejects 10.123 allocation", async () => {
      mockFilings.push({ id: "filing-p", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-p", filingId: "filing-p", snapshotEmployeeCode: "EP" });
      mockChallans.push({ id: "ch-p", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 1000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-p/allocations").send({
        statutoryFilingItemId: "item-p",
        tdsChallanId: "ch-p",
        allocatedTds: 10.123,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("INVALID_PRECISION");
    });

    it("Q. rejects 10.005 allocation", async () => {
      mockFilings.push({ id: "filing-q", companyId: "comp-1", status: "DRAFT" });
      mockItems.push({ id: "item-q", filingId: "filing-q", snapshotEmployeeCode: "EQ" });
      mockChallans.push({ id: "ch-q", companyId: "comp-1", challanSerialNo: "00001", tdsAmount: 1000 });

      const app = createTestApp();
      const res = await request(app).post("/compliance/tds/filings/filing-q/allocations").send({
        statutoryFilingItemId: "item-q",
        tdsChallanId: "ch-q",
        allocatedTds: 10.005,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("INVALID_PRECISION");
    });
  });
});

