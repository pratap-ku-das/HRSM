import { z } from "zod";
import type { StatutoryFilingDomain, ComplianceObligationStatus } from "@prisma/client";

export type { StatutoryFilingDomain, ComplianceObligationStatus };

export interface StatutoryDeadlineDefinition {
  domain: StatutoryFilingDomain;
  obligationType: string;
  jurisdiction: string; // 'IN' | 'KA' | 'MH' | 'TS' | 'WB'
  title: string;
  description: string;
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  legalBasis: string;
  officialSourceUrl?: string;
  calculateDueDate: (params: { year: number; month?: number; quarter?: string }) => Date;
}

export interface ObligationSyncResult {
  totalProcessed: number;
  created: number;
  updated: number;
  syncedFilings: number;
}

export const UpdateTargetDateSchema = z.object({
  internalTargetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "internalTargetDate must be YYYY-MM-DD")
    .optional()
    .nullable(),
});

export const AssignObligationSchema = z.object({
  assignedToUserId: z.string().min(1).optional().nullable(),
  assignedUserId: z.string().min(1).optional().nullable(),
});

export const UpdateObligationNotesSchema = z.object({
  notes: z.string().max(1000).optional().nullable(),
});

export const CompleteObligationSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export const SyncCalendarSchema = z.object({
  year: z.number().int().min(2020).max(2035).optional(),
  periodYear: z.number().int().min(2020).max(2035).optional(),
  month: z.number().int().min(1).max(12).optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
});
