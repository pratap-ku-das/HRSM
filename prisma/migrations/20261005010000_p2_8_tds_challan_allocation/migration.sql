-- Migration #30: 20261005010000_p2_8_tds_challan_allocation

-- 1. Create Allocation Table
CREATE TABLE "TdsChallanAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "statutoryFilingId" TEXT NOT NULL,
    "tdsChallanId" TEXT NOT NULL,
    "statutoryFilingItemId" TEXT NOT NULL,
    "allocatedTds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocatedSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocatedCess" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocatedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "TdsChallanAllocation_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes for Query Performance
CREATE INDEX "TdsChallanAllocation_companyId_idx" ON "TdsChallanAllocation"("companyId");
CREATE INDEX "TdsChallanAllocation_statutoryFilingId_idx" ON "TdsChallanAllocation"("statutoryFilingId");
CREATE INDEX "TdsChallanAllocation_tdsChallanId_idx" ON "TdsChallanAllocation"("tdsChallanId");
CREATE INDEX "TdsChallanAllocation_statutoryFilingItemId_idx" ON "TdsChallanAllocation"("statutoryFilingItemId");

-- 3. Business Invariant: Exactly one allocation row per (item, challan)
CREATE UNIQUE INDEX "TdsChallanAllocation_statutoryFilingItemId_tdsChallanId_key" 
ON "TdsChallanAllocation"("statutoryFilingItemId", "tdsChallanId");

-- 4. Target Unique Constraints for Composite Multi-Tenant & Hierarchical References
ALTER TABLE "StatutoryFiling" ADD CONSTRAINT "StatutoryFiling_id_companyId_key" UNIQUE ("id", "companyId");
ALTER TABLE "TdsChallan" ADD CONSTRAINT "TdsChallan_id_companyId_key" UNIQUE ("id", "companyId");
ALTER TABLE "StatutoryFilingItem" ADD CONSTRAINT "StatutoryFilingItem_id_filingId_key" UNIQUE ("id", "filingId");

-- 5. Foreign Keys Guaranteeing Composite Multi-Tenant & Filing Integrity
ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_companyId_fkey" 
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_filing_tenant_fkey" 
FOREIGN KEY ("statutoryFilingId", "companyId") REFERENCES "StatutoryFiling"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_challan_tenant_fkey" 
FOREIGN KEY ("tdsChallanId", "companyId") REFERENCES "TdsChallan"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_filingItem_fkey" 
FOREIGN KEY ("statutoryFilingItemId", "statutoryFilingId") REFERENCES "StatutoryFilingItem"("id", "filingId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Monetary Precision: Option B (Exact 2-Decimal Storage Constraints)
ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_nonnegative_check" 
CHECK ("allocatedTds" >= 0 AND "allocatedSurcharge" >= 0 AND "allocatedCess" >= 0 AND "allocatedTotal" >= 0);

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_exact_cents_tds_check"
CHECK ("allocatedTds"::numeric = round("allocatedTds"::numeric, 2));

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_exact_cents_surcharge_check"
CHECK ("allocatedSurcharge"::numeric = round("allocatedSurcharge"::numeric, 2));

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_exact_cents_cess_check"
CHECK ("allocatedCess"::numeric = round("allocatedCess"::numeric, 2));

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_exact_cents_total_check"
CHECK ("allocatedTotal"::numeric = round("allocatedTotal"::numeric, 2));

ALTER TABLE "TdsChallanAllocation" ADD CONSTRAINT "TdsChallanAllocation_allocatedTotal_sum_check" 
CHECK ("allocatedTotal"::numeric(15,2) = ("allocatedTds"::numeric(15,2) + "allocatedSurcharge"::numeric(15,2) + "allocatedCess"::numeric(15,2)));

-- 7. Update Default on StatutoryFilingItem.panStatus
ALTER TABLE "StatutoryFilingItem" ALTER COLUMN "panStatus" SET DEFAULT 'NOT_APPLICABLE';

-- 8. Capacity-Capped, Tenant-Safe Historical Backfill
WITH challan_load AS (
    SELECT 
        i."tdsChallanId",
        SUM(i."tdsAmount") AS total_claimed_tds
    FROM "StatutoryFilingItem" i
    WHERE i."tdsChallanId" IS NOT NULL
    GROUP BY i."tdsChallanId"
)
INSERT INTO "TdsChallanAllocation" (
    "id", "companyId", "statutoryFilingId", "tdsChallanId", "statutoryFilingItemId", 
    "allocatedTds", "allocatedSurcharge", "allocatedCess", "allocatedTotal", "createdAt"
)
SELECT 
    gen_random_uuid(), 
    f."companyId", 
    i."filingId", 
    i."tdsChallanId", 
    i."id",
    i."tdsAmount", 
    0, 
    0, 
    i."tdsAmount", 
    NOW()
FROM "StatutoryFilingItem" i
JOIN "StatutoryFiling" f ON f."id" = i."filingId"
JOIN "TdsChallan" c ON c."id" = i."tdsChallanId" AND c."companyId" = f."companyId"
JOIN challan_load l ON l."tdsChallanId" = c."id"
WHERE i."tdsChallanId" IS NOT NULL
  AND c."surcharge" = 0 
  AND c."cess" = 0
  AND l.total_claimed_tds <= c."tdsAmount"
  AND NOT EXISTS (
      SELECT 1 FROM "TdsChallanAllocation" a 
      WHERE a."statutoryFilingItemId" = i."id"
  );
