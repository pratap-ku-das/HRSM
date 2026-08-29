export type UserRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR_MANAGER' | 'DEPT_HEAD' | 'EMPLOYEE';

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

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
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
  dateOfJoining: string;
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
  locationLat?: number;
  locationLng?: number;
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
