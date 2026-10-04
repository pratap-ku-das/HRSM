import { z } from "zod";
import type { Request } from "express";

export interface ComplianceRequest extends Request {
  auth?: {
    id: string;
    companyId: string;
    role: string;
    employeeId?: string;
    permissions: string[];
  };
  requestId?: string;
}

export const money = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const UAN_REGEX = /^[0-9]{12}$/;
export const ESIC_IP_REGEX = /^[0-9]{10}$/;
export const BSR_REGEX = /^[0-9]{7}$/;
export const CHALLAN_SERIAL_REGEX = /^[0-9]{5}$/;

export const EmployeeStatutoryProfileSchema = z.object({
  uan: z.string().trim().regex(UAN_REGEX, "UAN must be exactly 12 numeric digits").optional().nullable(),
  pfMemberId: z.string().trim().min(3).max(50).optional().nullable(),
  esicIpNumber: z.string().trim().regex(ESIC_IP_REGEX, "ESIC IP Number must be exactly 10 numeric digits").optional().nullable(),
  panNumber: z.string().trim().toUpperCase().regex(PAN_REGEX, "Invalid PAN format (e.g. ABCDE1234F)").optional().nullable(),
  epsExempt: z.boolean().default(false),
  pfOptOut: z.boolean().default(false),
  ptState: z.string().trim().length(2).toUpperCase().optional().nullable(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveFrom must be YYYY-MM-DD").optional(),
});

export const TdsChallanSchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, "financialYear must be YYYY-YY (e.g. 2025-26)"),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  bsrCode: z.string().trim().regex(BSR_REGEX, "BSR code must be exactly 7 numeric digits"),
  challanDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "challanDate must be YYYY-MM-DD"),
  challanSerialNo: z.string().trim().regex(CHALLAN_SERIAL_REGEX, "Challan serial number must be exactly 5 numeric digits"),
  minorHead: z.enum(["200", "400"]).default("200"),
  tdsAmount: z.number().finite().nonnegative(),
  surcharge: z.number().finite().nonnegative().default(0),
  cess: z.number().finite().nonnegative().default(0),
  interest: z.number().finite().nonnegative().default(0),
  fee: z.number().finite().nonnegative().default(0),
  chequeOrDdNo: z.string().trim().max(30).optional().nullable(),
  statutoryFilingId: z.string().uuid().optional().nullable(),
});

export const CreateSnapshotFilingSchema = z.object({
  payrollRunId: z.string().uuid(),
  domain: z.enum(["EPF_ECR", "ESIC_MONTHLY", "TDS_24Q", "PROFESSIONAL_TAX"]),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12).optional().nullable(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional().nullable(),
  stateCode: z.string().trim().length(2).toUpperCase().optional().nullable(),
  filingType: z.enum(["ORIGINAL", "REVISED"]).default("ORIGINAL"),
});
