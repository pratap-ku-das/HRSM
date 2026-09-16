export type UserRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR_MANAGER' | 'PAYROLL_ADMIN' | 'MANAGER' | 'DEPT_HEAD' | 'EMPLOYEE';

export interface User {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  departmentId?: string;
  employeeId?: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  size: string; // '1-10', '11-50', '51-200', '201-500', '500+'
  plan: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  logoUrl?: string;
  createdAt: string;
}

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'CONSULTANT';
export type EmployeeStatus = 'ACTIVE' | 'ON_PROBATION' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED';

export interface SalaryBreakdown {
  basic: number;
  hra: number;
  allowances: number;
  providentFund: number;
  taxDeduction: number;
  currency: string;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  routingOrIfsc: string;
  taxIdentifier: string; // Indian PAN identifier
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface Employee {
  id: string;
  companyId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY';
  departmentId: string;
  designationId: string;
  reportingManagerId?: string;
  branchId?: string;
  workLocationId?: string;
  teamId?: string;
  costCenterId?: string;
  employeeGradeId?: string;
  dateOfJoining: string;
  confirmationDate?: string;
  probationEndDate?: string;
  resignationDate?: string;
  lastWorkingDay?: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  workLocation: string;
  salary: SalaryBreakdown;
  bankDetails: BankDetails;
  emergencyContact: EmergencyContact;
  skills: string[];
  createdAt: string;
}

export interface Department {
  id: string;
  companyId: string;
  name: string;
  code: string;
  headEmployeeId?: string;
  budget: number;
  location: string;
  description: string;
  employeeCount?: number;
}

export interface Designation {
  id: string;
  companyId: string;
  title: string;
  departmentId: string;
  gradeLevel: string; // 'L1', 'L2', 'L3', 'L4', 'Executive'
  minSalary: number;
  maxSalary: number;
  description: string;
}

export interface OrganizationItem { id: string; companyId: string; name: string; code: string; active: boolean; }
export interface Branch extends OrganizationItem { legalName?: string; timezone: string; }
export interface WorkLocation extends OrganizationItem { branchId?: string; address?: string; city?: string; state?: string; country: string; latitude?: number; longitude?: number; geofenceRadiusMeters?: number; remote: boolean; }
export interface Team extends OrganizationItem { departmentId?: string; managerEmployeeId?: string; }
export interface CostCenter extends OrganizationItem { description?: string; }
export interface EmployeeGrade extends OrganizationItem { rank: number; description?: string; }
export interface OrganizationStructure { branches: Branch[]; locations: WorkLocation[]; departments: Department[]; teams: Team[]; designations: Designation[]; costCenters: CostCenter[]; grades: EmployeeGrade[]; }
export type PermissionScope = 'ALL_COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'TEAM' | 'SELF';
export interface AccessPermission { id: string; companyId: string; key: string; description?: string; }
export interface AccessRole { id: string; companyId: string; name: string; code: string; description?: string; system: boolean; active: boolean; rolePermissions: Array<{ permission: AccessPermission }>; }
export interface UserAccessGrant { id: string; userId: string; roleId: string; scope: PermissionScope; scopeEntityId?: string; expiresAt?: string; role: AccessRole; user: Pick<User, 'id' | 'fullName' | 'email'>; }
export interface AccessConfiguration { permissions: AccessPermission[]; roles: AccessRole[]; grants: UserAccessGrant[]; users: Array<Pick<User, 'id' | 'fullName' | 'email' | 'role'> & { employee?: { id: string; branchId?: string; departmentId: string; teamId?: string } }>; }
export type WorkflowModule = 'LEAVE' | 'EXPENSE' | 'ATTENDANCE_CORRECTION' | 'WFH' | 'ON_DUTY' | 'BUSINESS_TRAVEL' | 'OVERTIME' | 'SALARY_REVISION' | 'PAYROLL' | 'DOCUMENT' | 'ADVANCE' | 'GENERIC';
export type WorkflowInstanceStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN';
export interface WorkflowStepDefinition { id: string; sequence: number; name: string; approverType: 'USER' | 'ROLE' | 'REPORTING_MANAGER' | 'DEPARTMENT_HEAD' | 'FINANCE'; approverReference?: string; minimumApprovals: number; slaHours?: number; allowDelegation: boolean; }
export interface WorkflowDefinition { id: string; module: WorkflowModule; name: string; code: string; version: number; status: 'DRAFT' | 'ACTIVE' | 'RETIRED'; steps: WorkflowStepDefinition[]; }
export interface WorkflowInstance { id: string; module: WorkflowModule; subjectType: string; subjectId: string; requesterUserId: string; status: WorkflowInstanceStatus; title: string; summary?: string; submittedAt: string; completedAt?: string; stepInstances: Array<{ id: string; sequence: number; status: string; dueAt?: string; approvals: number; minimumApprovals: number }>; actions?: Array<{ id: string; action: string; comment?: string; createdAt: string }>; }
export interface ApprovalInboxItem { id: string; sequence: number; status: string; dueAt?: string; approvals: number; minimumApprovals: number; step: WorkflowStepDefinition; instance: WorkflowInstance; }
export interface ShiftTemplate { id: string; companyId: string; name: string; code: string; type: 'FIXED'|'FLEXIBLE'|'NIGHT'|'ROTATIONAL'; startMinute: number; endMinute: number; breakMinutes: number; crossesMidnight: boolean; weeklyOffDays: number[]; active: boolean; }
export interface AttendancePolicy { id: string; name: string; shiftTemplateId?: string; graceInMinutes: number; graceOutMinutes: number; halfDayAfterMinutes: number; fullDayMinutes: number; overtimeAfterMinutes: number; missingPunchAction: string; allowRemote: boolean; requireGeofence: boolean; requireFace: boolean; effectiveFrom: string; active: boolean; shiftTemplate?: ShiftTemplate; }
export interface AttendanceRequestItem { id: string; type: 'REGULARIZATION'|'WFH'|'ON_DUTY'|'BUSINESS_TRAVEL'|'OVERTIME'; startDate: string; endDate: string; requestedClockIn?: string; requestedClockOut?: string; reason: string; status: 'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED'; workflowInstanceId?: string; createdAt: string; }
export interface AttendanceConfiguration { shifts: ShiftTemplate[]; policies: AttendancePolicy[]; assignments: Array<{ id: string; employeeId: string; startsOn: string; endsOn?: string; employee: Pick<Employee,'id'|'firstName'|'lastName'|'employeeCode'>; shiftTemplate: ShiftTemplate }>; locks: Array<{ id: string; periodStart: string; periodEnd: string; lockedAt: string; reason?: string }>; }
export interface SalaryComponent { id: string; code: string; name: string; kind: 'EARNING'|'DEDUCTION'|'EMPLOYER_CONTRIBUTION'|'REIMBURSEMENT'; method: 'FIXED'|'PERCENT_BASIC'|'PERCENT_GROSS'; value: number; taxable: boolean; proratable: boolean; sequence: number; }
export interface SalaryStructure { id: string; name: string; code: string; active: boolean; components: SalaryComponent[]; }
export interface PayrollEngineRun { id: string; month: string; status: string; totalEmployees: number; totalGrossSalary: number; totalDeductions: number; totalNetPayout: number; lines: Array<{ id: string; employeeId: string; netPay: number; breakdown: Record<string,number>; calculationTrace: string[] }>; }
export interface PayrollConfiguration { structures: SalaryStructure[]; revisions: Array<{ id: string; employeeId: string; effectiveFrom: string; annualCtc: number; status: string; employee: Pick<Employee,'id'|'employeeCode'|'firstName'|'lastName'>; structure: SalaryStructure }>; rules: Array<{ id: string; type: string; stateCode?: string; effectiveFrom: string; configuration: Record<string,unknown>; sourceNote?: string }>; loans: Array<{ id: string; type: string; principal: number; outstanding: number; installment: number; status: string }>; runs: PayrollEngineRun[]; }
export interface Employee360 { employee: Employee & { department?: Department; designation?: Designation; branch?: Branch; location?: WorkLocation; team?: Team; costCenter?: CostCenter; employeeGrade?: EmployeeGrade; reportingManager?: Pick<Employee,'id'|'firstName'|'lastName'|'employeeCode'> }; attendance: AttendanceRecord[]; leave: LeaveRequest[]; payslips: Payslip[]; assets: Asset[]; expenses: ExpenseClaim[]; goals: PerformanceGoal[]; revisions: Array<{id:string;effectiveFrom:string;annualCtc:number;status:string}>; requests: WorkflowInstance[]; timeline: Array<{id:string;at:string;type:string;title:string;detail:string}>; }
export interface CommandCenterData { metrics: { activeEmployees:number; presentToday:number; absentToday:number; onLeaveToday:number }; alerts: Array<{key:string;severity:'INFO'|'WARNING'|'CRITICAL';count:number;message:string}>; }
export interface OrbitNotification { id:string; eventKey:string; title:string; body:string; entityType?:string; entityId?:string; actionUrl?:string; readAt?:string; expiresAt?:string; createdAt:string; }
export interface NotificationPreference { id?:string; eventKey:string; channel:'IN_APP'|'EMAIL'|'PUSH'; enabled:boolean; }

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND';
export type AttendanceSource = 'WEB_ADMIN' | 'MOBILE_FACE' | 'BIOMETRIC_DEVICE' | 'SYSTEM_AUTO';

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  
  // Future Mobile Face-Auth & Clock In/Out Fields (Architected for Phase 6)
  clockInTime?: string; // ISO String or HH:mm
  clockOutTime?: string; // ISO String or HH:mm
  clockInPhotoUrl?: string;
  clockOutPhotoUrl?: string;
  faceAuthVerified?: boolean;
  faceConfidenceScore?: number;
  deviceId?: string;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAccuracyMeters?: number | null;
  clockInIpAddress?: string | null;
  clockOutIpAddress?: string | null;
  source: AttendanceSource;
  
  // Web HR Admin adjustment fields
  correctionNote?: string;
  correctedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceCorrectionRequest {
  id: string;
  companyId: string;
  employeeId: string;
  date: string;
  currentStatus: AttendanceStatus;
  requestedStatus: AttendanceStatus;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: string;
}

export interface LeaveType {
  id: string;
  companyId: string;
  name: string;
  code: string;
  daysAllowedPerYear: number;
  isPaid: boolean;
  color: string;
}

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  id: string;
  companyId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  reason: string;
  status: LeaveRequestStatus;
  approvedBy?: string;
  reviewerComment?: string;
  appliedAt: string;
}

export interface LeaveBalance {
  employeeId: string;
  leaveTypeId: string;
  totalAllocated: number;
  used: number;
  remaining: number;
}

export interface PayrollRun {
  id: string;
  companyId: string;
  month: string; // YYYY-MM
  status: 'DRAFT' | 'PROCESSED' | 'PAID';
  totalEmployees: number;
  totalGrossSalary: number;
  totalDeductions: number;
  totalNetPayout: number;
  processedDate?: string;
  createdAt: string;
}

export interface Payslip {
  id: string;
  companyId: string;
  payrollRunId: string;
  employeeId: string;
  month: string; // YYYY-MM
  basicSalary: number;
  hra: number;
  allowances: number;
  grossSalary: number;
  providentFund: number;
  taxDeductions: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  workingDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidDays: number;
  status: 'GENERATED' | 'PAID';
  paymentDate?: string;
}

export type JobStage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

export interface JobPosting {
  id: string;
  companyId: string;
  title: string;
  departmentId: string;
  location: string;
  employmentType: EmploymentType;
  experienceLevel: string;
  minSalary: number;
  maxSalary: number;
  currency: string;
  status: 'OPEN' | 'CLOSED' | 'DRAFT';
  description: string;
  requirements: string[];
  applicantCount: number;
  postedAt: string;
}

export interface JobApplicant {
  id: string;
  companyId: string;
  jobPostingId: string;
  fullName: string;
  email: string;
  phone: string;
  currentCompany?: string;
  experienceYears: number;
  stage: JobStage;
  rating: number; // 1-5
  notes: string;
  appliedAt: string;
  resumeUrl?: string;
}

export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'AT_RISK';

export interface PerformanceGoal {
  id: string;
  companyId: string;
  employeeId: string;
  title: string;
  description: string;
  category: 'OKR' | 'PROJECT' | 'SKILL' | 'LEADERSHIP';
  targetDate: string;
  progress: number; // 0 - 100
  status: GoalStatus;
  createdAt: string;
}

export interface PerformanceReview {
  id: string;
  companyId: string;
  employeeId: string;
  reviewerId: string;
  reviewCycle: string; // e.g., 'Q3 2026', 'Annual 2026'
  overallRating: number; // 1 - 5
  strengths: string;
  growthAreas: string;
  goalsForNextPeriod: string;
  status: 'PENDING' | 'COMPLETED';
  completedDate?: string;
}
export interface PerformanceCycleV1 { id:string;name:string;startsAt:string;endsAt:string;status:'DRAFT'|'ACTIVE'|'REVIEW'|'CLOSED' }
export interface PerformanceReviewV1 { id:string;cycleId:string;employeeId:string;reviewerId:string;status:'DRAFT'|'SUBMITTED'|'MANAGER_REVIEWED'|'HR_REVIEWED'|'ACKNOWLEDGED';overallRating?:number;goalRating?:number;competencyRating?:number;strengths?:string;growthAreas?:string;summary?:string;cycle:PerformanceCycleV1;employee:{employeeCode:string;firstName:string;lastName:string} }
export interface PerformanceWorkspace { cycles:PerformanceCycleV1[];reviews:PerformanceReviewV1[] }

export type AssetCategory = 'LAPTOP' | 'MONITOR' | 'PHONE' | 'ACCESS_CARD' | 'FURNITURE' | 'OTHER';
export type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED';

export interface Asset {
  id: string;
  companyId: string;
  name: string;
  category: AssetCategory;
  serialNumber: string;
  assignedToEmployeeId?: string;
  assignedDate?: string;
  purchaseDate: string;
  purchaseCost: number;
  currency: string;
  status: AssetStatus;
  condition: 'NEW' | 'EXCELLENT' | 'GOOD' | 'FAIR';
}

export interface CompanyDocument {
  id: string;
  companyId: string;
  title: string;
  category: 'POLICY' | 'HANDBOOK' | 'TEMPLATE' | 'COMPLIANCE' | 'BENEFITS';
  fileSize: string;
  fileType: string;
  downloadUrl: string;
  uploadedAt: string;
}

export interface Holiday {
  id: string;
  companyId: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: 'NATIONAL' | 'REGIONAL' | 'COMPANY';
}

export interface Announcement {
  id: string;
  companyId: string;
  title: string;
  content: string;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  authorName: string;
  authorRole: string;
  targetDepartmentId?: string; // undefined means all departments
  createdAt: string;
}

export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';

export interface ExpenseClaim {
  id: string;
  companyId: string;
  employeeId: string;
  title: string;
  category: 'TRAVEL' | 'MEALS' | 'HARDWARE' | 'CERTIFICATION' | 'MISC';
  amount: number;
  currency: string;
  expenseDate: string;
  status: ExpenseStatus;
  notes?: string;
  submittedAt: string;
}

export interface AuditLog {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string; // 'CREATE_EMPLOYEE', 'UPDATE_ATTENDANCE', 'APPROVE_LEAVE', 'PROCESS_PAYROLL', etc.
  category: 'EMPLOYEE' | 'ATTENDANCE' | 'LEAVE' | 'PAYROLL' | 'AUTH' | 'SETTINGS' | 'SYSTEM';
  details: string;
  timestamp: string;
  ipAddress: string;
}

export interface CompanySettings {
  id: string;
  companyId: string;
  companyName: string;
  legalEntityName: string;
  taxRegistrationNumber: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
  workDays: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  businessHoursStart: string; // "09:00"
  businessHoursEnd: string; // "18:00"
  enableAutomaticOvertime: boolean;
  enableAuditLogging: boolean;
  defaultProbationPeriodMonths: number;
}
