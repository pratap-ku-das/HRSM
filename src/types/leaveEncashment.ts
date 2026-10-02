export interface LeaveEncashmentEligibility {
  employee: { id: string; status: string; firstName: string; lastName: string };
  formula: string;
  monthlyBasic: number;
  dailyRate: number;
  minBufferDays: number;
  leaveTypes: Array<{
    leaveTypeId: string;
    name: string;
    code: string;
    isPaid: boolean;
    entitlement: number;
    carryForwardDays: number;
    usedLeaveDays: number;
    encashedDays: number;
    availableBalance: number;
    minBufferDays: number;
    maxEncashable: number;
    eligible: boolean;
    hasPending: boolean;
    ineligibleReason?: string;
    estimatedPayoutForMaxDays: number;
  }>;
}

export interface LeaveEncashmentItem {
  id: string;
  companyId: string;
  employeeId: string;
  type: string;
  title: string;
  reason: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  workflowInstanceId?: string;
  createdAt: string;
  payload?: {
    leaveTypeId?: string;
    leaveTypeCode?: string;
    leaveTypeName?: string;
    days?: number;
    monthlyBasic?: number;
    dailyRate?: number;
    amount?: number;
    minBufferDays?: number;
    remainingBalanceAfterEncashment?: number;
    payrollMonth?: string;
    formula?: string;
  };
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department?: { name: string };
    designation?: { title: string };
  };
  workflowStatus?: string;
  currentStepSequence?: number;
  approverUserIds?: string[];
  dueAt?: string;
  isOverdue?: boolean;
  canReview?: boolean;
}
