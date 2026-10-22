import type { PrismaClient, ComplianceObligationStatus, StatutoryFiling } from "@prisma/client";
import {
  STATUTORY_DEADLINE_DEFINITIONS,
  createUtcDate,
} from "./deadlineEngine.js";
import type { ObligationSyncResult } from "./types.js";

/**
 * Computes dynamic operational status for a compliance calendar obligation based on
 * current date and linked filing/challan state.
 */
export function deriveObligationStatus(params: {
  now?: Date;
  dueDate: Date;
  extendedDueDate?: Date | null;
  internalTargetDate?: Date | null;
  filing?: (StatutoryFiling & {
    ptChallan?: { status: string; challanNumber?: string | null } | null;
    epfChallans?: Array<{ status: string; trrnNumber?: string | null }>;
    esicChallans?: Array<{ status: string; challanNumber?: string | null; cprnNumber?: string | null }>;
    challans?: Array<{ id: string; challanNumber?: string | null; challanSerialNo?: string | null; bsrCode?: string | null }>;
  }) | null;
  manualCompletedAt?: Date | null;
}): ComplianceObligationStatus {
  if (params.manualCompletedAt) {
    return "COMPLETED";
  }

  const effectiveDue = params.extendedDueDate || params.dueDate;
  const now = params.now || new Date();

  // Normalize to UTC dates for day-level comparison
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueDay = Date.UTC(effectiveDue.getUTCFullYear(), effectiveDue.getUTCMonth(), effectiveDue.getUTCDate());
  const diffDays = Math.round((dueDay - nowDay) / 86_400_000);

  const filing = params.filing;
  if (filing) {
    // 1. External submission confirmation evidence:
    // Requires verified government portal reference (PRN, Token No, TRRN, CPRN, or Challan No)
    // A local locked state or exported artifact alone does NOT establish external filing.
    const hasTdsReceipt = Boolean(filing.tokenNumberPrn || filing.filingReceiptDate);
    const hasEpfTrrn = Boolean(filing.epfChallans?.some((c) => c.trrnNumber && c.trrnNumber.trim().length > 0));
    const hasEsicChallanNum = Boolean(
      filing.esicChallans?.some(
        (c) => (c.challanNumber && c.challanNumber.trim().length > 0) || (c.cprnNumber && c.cprnNumber.trim().length > 0)
      )
    );
    const hasPtChallanNum = Boolean(filing.ptChallan?.challanNumber && filing.ptChallan.challanNumber.trim().length > 0);

    const isExternallySubmitted = hasTdsReceipt || hasEpfTrrn || hasEsicChallanNum || hasPtChallanNum;

    // 2. Payment reconciliation evidence:
    const hasPaidEpf = filing.epfChallans?.some((c) => ["PAID", "RECONCILED"].includes(c.status));
    const hasPaidEsic = filing.esicChallans?.some((c) => ["PAID", "RECONCILED"].includes(c.status));
    const hasPaidPt = filing.ptChallan && ["PAID", "RECONCILED"].includes(filing.ptChallan.status);
    const hasTdsChallan = Boolean(
      filing.challans &&
      filing.challans.length > 0 &&
      filing.challans.some((c) => Boolean(c.challanNumber || c.challanSerialNo || c.id))
    );

    const isFullyPaid = Boolean(hasPaidEpf || hasPaidEsic || hasPaidPt || hasTdsChallan);

    // 3. Status Derivation based on verified evidence:
    if (isExternallySubmitted && isFullyPaid) {
      return "COMPLETED";
    }

    if (isExternallySubmitted && !isFullyPaid) {
      return "FILED";
    }

    if (!isExternallySubmitted && isFullyPaid) {
      return "PAID";
    }

    // 4. Handle Rejected, Cancelled, or Superseded filings:
    if (filing.status === "CANCELLED" || filing.status === "SUPERSEDED" || Boolean(filing.rejectionReason)) {
      if (diffDays < 0) return "OVERDUE";
      return "NEEDS_REVIEW";
    }

    // Internal workflow stages (DRAFT, VALIDATED, PENDING_APPROVAL, APPROVED, or EXPORTED without portal receipt)
    // do NOT constitute filing. They evaluate against statutory due date proximity below.
  }

  // 5. Statutory deadline proximity evaluation:
  if (diffDays < 0) {
    return "OVERDUE";
  }
  if (diffDays === 0) {
    return "DUE_TODAY";
  }
  if (diffDays <= 3) {
    return "DUE_SOON";
  }
  return "UPCOMING";
}

/**
 * Synchronizes compliance calendar obligations for a company for a given calendar year.
 * Populates EPF, ESIC, TDS, and state PT obligations, linking them with existing statutory filings.
 */
export async function syncCompanyCalendar(
  prisma: PrismaClient,
  companyId: string,
  year = new Date().getUTCFullYear(),
  month?: number,
): Promise<ObligationSyncResult> {
  let createdCount = 0;
  let updatedCount = 0;
  let syncedFilingsCount = 0;

  // 1. Fetch active state registrations for Professional Tax
  const ptRegistrations = await prisma.professionalTaxRegistration.findMany({
    where: { companyId, status: "ACTIVE" },
    select: { stateCode: true },
  });
  const activePtStates = Array.from(new Set(ptRegistrations.map((r) => r.stateCode.toUpperCase())));

  // 2. Fetch all existing statutory filings for the target year
  const filings = await prisma.statutoryFiling.findMany({
    where: { companyId, periodYear: year },
    include: {
      ptChallan: true,
      epfChallans: true,
      esicChallans: true,
      challans: true,
    },
  });

  const monthsToProcess = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);

  for (const m of monthsToProcess) {
    // A. EPF / ECR
    const epfDef = STATUTORY_DEADLINE_DEFINITIONS.find(
      (d) => d.domain === "EPF_ECR" && d.obligationType === "MONTHLY_ECR_AND_CONTRIBUTION",
    )!;
    const epfDue = epfDef.calculateDueDate({ year, month: m });
    const epfFiling = filings.find((f) => f.domain === "EPF_ECR" && f.periodMonth === m);

    const epfUpsert = await upsertObligation(prisma, {
      companyId,
      domain: "EPF_ECR",
      obligationType: epfDef.obligationType,
      jurisdiction: "IN",
      periodYear: year,
      periodMonth: m,
      quarter: null,
      statutoryDueDate: epfDue,
      filing: epfFiling || null,
    });
    if (epfUpsert.isNew) createdCount++;
    else updatedCount++;
    if (epfFiling) syncedFilingsCount++;

    // B. ESIC Monthly
    const esicDef = STATUTORY_DEADLINE_DEFINITIONS.find(
      (d) => d.domain === "ESIC_MONTHLY" && d.obligationType === "MONTHLY_CONTRIBUTION_AND_RETURN",
    )!;
    const esicDue = esicDef.calculateDueDate({ year, month: m });
    const esicFiling = filings.find((f) => f.domain === "ESIC_MONTHLY" && f.periodMonth === m);

    const esicUpsert = await upsertObligation(prisma, {
      companyId,
      domain: "ESIC_MONTHLY",
      obligationType: esicDef.obligationType,
      jurisdiction: "IN",
      periodYear: year,
      periodMonth: m,
      quarter: null,
      statutoryDueDate: esicDue,
      filing: esicFiling || null,
    });
    if (esicUpsert.isNew) createdCount++;
    else updatedCount++;
    if (esicFiling) syncedFilingsCount++;

    // C. Monthly TDS Deposit
    const tdsMonthlyDef = STATUTORY_DEADLINE_DEFINITIONS.find(
      (d) => d.domain === "TDS_24Q" && d.obligationType === "MONTHLY_TDS_DEPOSIT",
    )!;
    const tdsDue = tdsMonthlyDef.calculateDueDate({ year, month: m });

    // Look for challan in this month
    const tdsChallan = prisma.tdsChallan
      ? await prisma.tdsChallan.findFirst({
          where: {
            companyId,
            challanDate: {
              gte: createUtcDate(year, m, 1),
              lte: createUtcDate(year, m, 31),
            },
          },
        })
      : null;

    const tdsMonthlyUpsert = await upsertObligation(prisma, {
      companyId,
      domain: "TDS_24Q",
      obligationType: tdsMonthlyDef.obligationType,
      jurisdiction: "IN",
      periodYear: year,
      periodMonth: m,
      quarter: null,
      statutoryDueDate: tdsDue,
      filing: null,
      manualCompleted: Boolean(tdsChallan),
    });
    if (tdsMonthlyUpsert.isNew) createdCount++;
    else updatedCount++;

    // D. Multi-State Professional Tax (for active company states)
    for (const stateCode of activePtStates) {
      const ptDef = STATUTORY_DEADLINE_DEFINITIONS.find(
        (d) => d.domain === "PROFESSIONAL_TAX" && d.jurisdiction === stateCode,
      );
      if (!ptDef) continue;

      const ptDue = ptDef.calculateDueDate({ year, month: m });
      const ptFiling = filings.find(
        (f) => f.domain === "PROFESSIONAL_TAX" && f.periodMonth === m && f.stateCode === stateCode,
      );

      const ptUpsert = await upsertObligation(prisma, {
        companyId,
        domain: "PROFESSIONAL_TAX",
        obligationType: ptDef.obligationType,
        jurisdiction: stateCode,
        periodYear: year,
        periodMonth: m,
        quarter: null,
        statutoryDueDate: ptDue,
        filing: ptFiling || null,
      });
      if (ptUpsert.isNew) createdCount++;
      else updatedCount++;
      if (ptFiling) syncedFilingsCount++;
    }
  }

  // 3. Quarterly TDS Statements (Q1, Q2, Q3, Q4)
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  for (const q of quarters) {
    const tdsQDef = STATUTORY_DEADLINE_DEFINITIONS.find(
      (d) => d.domain === "TDS_24Q" && d.obligationType === "QUARTERLY_STATEMENT_24Q",
    )!;
    const tdsQDue = tdsQDef.calculateDueDate({ year, quarter: q });
    const tdsQFiling = filings.find((f) => f.domain === "TDS_24Q" && f.quarter === q);

    const tdsQUpsert = await upsertObligation(prisma, {
      companyId,
      domain: "TDS_24Q",
      obligationType: tdsQDef.obligationType,
      jurisdiction: "IN",
      periodYear: year,
      periodMonth: null,
      quarter: q,
      statutoryDueDate: tdsQDue,
      filing: tdsQFiling || null,
    });
    if (tdsQUpsert.isNew) createdCount++;
    else updatedCount++;
    if (tdsQFiling) syncedFilingsCount++;
  }

  return {
    totalProcessed: createdCount + updatedCount,
    created: createdCount,
    updated: updatedCount,
    syncedFilings: syncedFilingsCount,
  };
}

async function upsertObligation(
  prisma: PrismaClient,
  input: {
    companyId: string;
    domain: any;
    obligationType: string;
    jurisdiction: string;
    periodYear: number;
    periodMonth: number | null;
    quarter: string | null;
    statutoryDueDate: Date;
    filing: any | null;
    manualCompleted?: boolean;
  },
): Promise<{ isNew: boolean }> {
  const existing = await prisma.complianceCalendarObligation.findFirst({
    where: {
      companyId: input.companyId,
      domain: input.domain,
      obligationType: input.obligationType,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      quarter: input.quarter,
      jurisdiction: input.jurisdiction,
    },
  });

  const status = deriveObligationStatus({
    dueDate: input.statutoryDueDate,
    extendedDueDate: existing?.extendedDueDate,
    internalTargetDate: existing?.internalTargetDate,
    filing: input.filing,
    manualCompletedAt: existing?.completedAt || (input.manualCompleted ? new Date() : null),
  });

  if (!existing) {
    await prisma.complianceCalendarObligation.create({
      data: {
        companyId: input.companyId,
        domain: input.domain,
        obligationType: input.obligationType,
        jurisdiction: input.jurisdiction,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        quarter: input.quarter,
        statutoryDueDate: input.statutoryDueDate,
        status,
        statutoryFilingId: input.filing?.id || null,
        completedAt: input.manualCompleted ? new Date() : null,
      },
    });
    return { isNew: true };
  } else {
    await prisma.complianceCalendarObligation.update({
      where: { id: existing.id },
      data: {
        statutoryDueDate: input.statutoryDueDate,
        status,
        statutoryFilingId: input.filing?.id || existing.statutoryFilingId,
        completedAt: existing.completedAt || (input.manualCompleted ? new Date() : null),
      },
    });
    return { isNew: false };
  }
}
