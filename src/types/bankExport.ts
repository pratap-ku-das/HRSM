export type BankFormat = 'STANDARD_RBI' | 'HDFC_CMS' | 'ICICI_CIB' | 'SBI_CMP';

export interface BankTransferEntry {
  employeeId: string;
  employeeCode: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  amount: number;
  paymentType: 'NEFT' | 'RTGS';
  email?: string;
  remarks: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface BankBatchSummary {
  bankName: string;
  recordCount: number;
  totalAmount: number;
}

export interface BankExportPreviewResponse {
  summary: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    totalAmount: number;
    neftCount: number;
    neftAmount: number;
    rtgsCount: number;
    rtgsAmount: number;
  };
  bankBatches: BankBatchSummary[];
  validEntries: BankTransferEntry[];
  invalidEntries: BankTransferEntry[];
  duplicateWarnings: Array<{
    accountNumber: string;
    count: number;
    employeeCodes: string[];
    warning: string;
  }>;
  bankFormat: BankFormat;
}

export interface BankExportBatchItem {
  id: string;
  companyId: string;
  userId: string;
  reportKey: string;
  format: BankFormat;
  rowCount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  user?: { id: string; fullName: string; email: string };
  filters?: {
    sourceType?: string;
    payrollRunId?: string;
    payrollRunMonth?: string;
    totalAmount?: number;
    sha256Checksum?: string;
    notes?: string;
    makerUserId?: string;
    makerUserRole?: string;
    checkerUserId?: string;
    checkerUserRole?: string;
    approvedAt?: string;
    isLocked?: boolean;
    entries?: BankTransferEntry[];
  };
}
