import { 
  Company, User, Employee, Department, Designation, AttendanceRecord, 
  LeaveType, LeaveRequest, PayrollRun, Payslip, 
  JobPosting, JobApplicant, PerformanceGoal, 
  Asset, CompanyDocument, Holiday, Announcement, ExpenseClaim, 
  AuditLog, CompanySettings, AttendanceStatus 
} from '../types';
import { api } from './api';

const STORAGE_KEYS = {
  COMPANIES: 'hrms_companies_v2',
  USERS: 'hrms_users_v2',
  EMPLOYEES: 'hrms_employees_v2',
  DEPARTMENTS: 'hrms_departments_v2',
  DESIGNATIONS: 'hrms_designations_v2',
  ATTENDANCE: 'hrms_attendance_v2',
  LEAVE_TYPES: 'hrms_leave_types_v2',
  LEAVE_REQUESTS: 'hrms_leave_requests_v2',
  PAYROLL_RUNS: 'hrms_payroll_runs_v2',
  PAYSLIPS: 'hrms_payslips_v2',
  JOB_POSTINGS: 'hrms_job_postings_v2',
  JOB_APPLICANTS: 'hrms_job_applicants_v2',
  GOALS: 'hrms_goals_v2',
  ASSETS: 'hrms_assets_v2',
  DOCUMENTS: 'hrms_documents_v2',
  HOLIDAYS: 'hrms_holidays_v2',
  ANNOUNCEMENTS: 'hrms_announcements_v2',
  EXPENSES: 'hrms_expenses_v2',
  AUDIT_LOGS: 'hrms_audit_logs_v2',
  SETTINGS: 'hrms_settings_v2',
  ACTIVE_SESSION: 'hrms_active_session_v2',
};

class StorageService {
  private get<T>(key: string, defaultVal: T): T {
    try {
      const data = localStorage.getItem(key);
      if (!data) return defaultVal;
      return JSON.parse(data);
    } catch {
      return defaultVal;
    }
  }

  private set<T>(key: string, val: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('Storage write error:', e);
    }
  }

  public init(): void {
    // Clear all legacy mock data
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith('hrms_') && !k.endsWith('_v2'));
    oldKeys.forEach(k => localStorage.removeItem(k));

    // Migrate previously saved US defaults so existing workspaces immediately use India settings.
    const settings = this.get<CompanySettings[]>(STORAGE_KEYS.SETTINGS, []);
    if (settings.length) {
      this.set(STORAGE_KEYS.SETTINGS, settings.map(item => ({
        ...item,
        currency: 'INR',
        currencySymbol: '₹',
        timezone: 'Asia/Kolkata (IST - UTC+5:30)',
      })));
    }

    const employees = this.get<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
    if (employees.length) this.set(STORAGE_KEYS.EMPLOYEES, employees.map(item => ({ ...item, salary: { ...item.salary, currency: 'INR' } })));
    const jobs = this.get<JobPosting[]>(STORAGE_KEYS.JOB_POSTINGS, []);
    if (jobs.length) this.set(STORAGE_KEYS.JOB_POSTINGS, jobs.map(item => ({ ...item, currency: 'INR' })));
    const assets = this.get<Asset[]>(STORAGE_KEYS.ASSETS, []);
    if (assets.length) this.set(STORAGE_KEYS.ASSETS, assets.map(item => ({ ...item, currency: 'INR' })));
    const expenses = this.get<ExpenseClaim[]>(STORAGE_KEYS.EXPENSES, []);
    if (expenses.length) this.set(STORAGE_KEYS.EXPENSES, expenses.map(item => ({ ...item, currency: 'INR' })));
  }

  // Clear all data completely
  public clearAllData(): void {
    const keys = Object.values(STORAGE_KEYS);
    keys.forEach(k => localStorage.removeItem(k));
  }

  // Company / Tenant
  public getCompanies(): Company[] {
    return this.get<Company[]>(STORAGE_KEYS.COMPANIES, []);
  }

  public getCompanyById(id: string): Company | undefined {
    return this.getCompanies().find(c => c.id === id);
  }

  public createCompany(company: Company, adminUser: User, initialSettings: CompanySettings): void {
    const companies = this.getCompanies();
    companies.push(company);
    this.set(STORAGE_KEYS.COMPANIES, companies);

    const users = this.getUsers();
    users.push(adminUser);
    this.set(STORAGE_KEYS.USERS, users);

    const allSettings = this.get<CompanySettings[]>(STORAGE_KEYS.SETTINGS, []);
    allSettings.push(initialSettings);
    this.set(STORAGE_KEYS.SETTINGS, allSettings);

    // Seed default starter departments for the clean new company
    const defaultDepts: Department[] = [
      { id: `dept-${Date.now()}-1`, companyId: company.id, name: 'Executive & Leadership', code: 'EXEC', budget: 5000000, location: 'Bengaluru Headquarters', description: 'Core leadership.' },
      { id: `dept-${Date.now()}-2`, companyId: company.id, name: 'Engineering & Technology', code: 'ENG', budget: 15000000, location: 'Bengaluru Technology Centre', description: 'Software engineering.' },
      { id: `dept-${Date.now()}-3`, companyId: company.id, name: 'People & HR', code: 'HR', budget: 3000000, location: 'Bengaluru Headquarters', description: 'Human resources and operations.' },
    ];
    const depts = this.getDepartments();
    depts.push(...defaultDepts);
    this.set(STORAGE_KEYS.DEPARTMENTS, depts);

    // Seed default leave types for the new company
    const defaultLeaves: LeaveType[] = [
      { id: `lt-${Date.now()}-1`, companyId: company.id, name: 'Paid Annual Leave', code: 'AL', daysAllowedPerYear: 20, isPaid: true, color: '#3b82f6' },
      { id: `lt-${Date.now()}-2`, companyId: company.id, name: 'Sick Leave', code: 'SL', daysAllowedPerYear: 12, isPaid: true, color: '#ef4444' },
      { id: `lt-${Date.now()}-3`, companyId: company.id, name: 'Casual Leave', code: 'CL', daysAllowedPerYear: 10, isPaid: true, color: '#f59e0b' },
    ];
    const leaves = this.getLeaveTypes();
    leaves.push(...defaultLeaves);
    this.set(STORAGE_KEYS.LEAVE_TYPES, leaves);

    this.logAudit({
      companyId: company.id,
      userId: adminUser.id,
      userName: adminUser.fullName,
      userRole: adminUser.role,
      action: 'REGISTER_COMPANY',
      category: 'SYSTEM',
      details: `Company workspace ${company.name} provisioned in PostgreSQL.`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    // Also dispatch to backend API if live server is reachable
    api.registerCompany(company, adminUser, company.plan).catch(err => {
      console.warn('Backend API registration background sync:', err.message);
    });
  }

  // Users
  public getUsers(): User[] {
    return this.get<User[]>(STORAGE_KEYS.USERS, []);
  }

  public getUsersByCompany(companyId: string): User[] {
    return this.getUsers().filter(u => u.companyId === companyId);
  }

  // Employees
  public getEmployees(companyId?: string): Employee[] {
    const all = this.get<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
    return companyId ? all.filter(e => e.companyId === companyId) : all;
  }

  public saveEmployee(emp: Employee): void {
    const all = this.getEmployees();
    const idx = all.findIndex(e => e.id === emp.id);
    if (idx >= 0) {
      all[idx] = emp;
    } else {
      all.push(emp);
    }
    this.set(STORAGE_KEYS.EMPLOYEES, all);

    const department = this.getDepartments(emp.companyId).find(item => item.id === emp.departmentId);
    const designation = this.getDesignations(emp.companyId).find(item => item.id === emp.designationId);
    api.saveEmployee({
      ...emp,
      departmentCode: department?.code,
      departmentName: department?.name,
      departmentLocation: department?.location,
      designationTitle: designation?.title,
      designationGradeLevel: designation?.gradeLevel,
      designationMinSalary: designation?.minSalary,
      designationMaxSalary: designation?.maxSalary,
    } as Partial<Employee>).catch(err => console.warn('API saveEmployee sync:', err.message));
  }

  public deleteEmployee(id: string): void {
    const all = this.getEmployees().filter(e => e.id !== id);
    this.set(STORAGE_KEYS.EMPLOYEES, all);

    api.deleteEmployee(id).catch(err => console.warn('API deleteEmployee sync:', err.message));
  }

  // Departments
  public getDepartments(companyId?: string): Department[] {
    const all = this.get<Department[]>(STORAGE_KEYS.DEPARTMENTS, []);
    return companyId ? all.filter(d => d.companyId === companyId) : all;
  }

  public saveDepartment(dept: Department): void {
    const all = this.getDepartments();
    const idx = all.findIndex(d => d.id === dept.id);
    if (idx >= 0) {
      all[idx] = dept;
    } else {
      all.push(dept);
    }
    this.set(STORAGE_KEYS.DEPARTMENTS, all);

    api.saveDepartment(dept).catch(err => console.warn('API saveDepartment sync:', err.message));
  }

  public deleteDepartment(id: string): void {
    const all = this.getDepartments().filter(d => d.id !== id);
    this.set(STORAGE_KEYS.DEPARTMENTS, all);
  }

  // Designations
  public getDesignations(companyId?: string): Designation[] {
    const all = this.get<Designation[]>(STORAGE_KEYS.DESIGNATIONS, []);
    return companyId ? all.filter(d => d.companyId === companyId) : all;
  }

  public saveDesignation(desig: Designation): void {
    const all = this.getDesignations();
    const idx = all.findIndex(d => d.id === desig.id);
    if (idx >= 0) {
      all[idx] = desig;
    } else {
      all.push(desig);
    }
    this.set(STORAGE_KEYS.DESIGNATIONS, all);

    api.saveDesignation(desig).catch(err => console.warn('API saveDesignation sync:', err.message));
  }

  public deleteDesignation(id: string): void {
    const all = this.getDesignations().filter(d => d.id !== id);
    this.set(STORAGE_KEYS.DESIGNATIONS, all);
  }

  // Attendance
  public getAttendanceRecords(companyId?: string): AttendanceRecord[] {
    const all = this.get<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    return companyId ? all.filter(a => a.companyId === companyId) : all;
  }

  public saveAttendanceRecord(record: AttendanceRecord): void {
    const all = this.getAttendanceRecords();
    const idx = all.findIndex(a => a.employeeId === record.employeeId && a.date === record.date);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...record, updatedAt: new Date().toISOString() };
    } else {
      all.push(record);
    }
    this.set(STORAGE_KEYS.ATTENDANCE, all);

    api.saveAttendanceRecord(record).catch(err => console.warn('API saveAttendanceRecord sync:', err.message));
  }

  public bulkMarkAttendance(records: AttendanceRecord[]): void {
    const all = this.getAttendanceRecords();
    records.forEach(rec => {
      const idx = all.findIndex(a => a.employeeId === rec.employeeId && a.date === rec.date);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...rec, updatedAt: new Date().toISOString() };
      } else {
        all.push(rec);
      }
    });
    this.set(STORAGE_KEYS.ATTENDANCE, all);

    api.bulkMarkAttendance(records).catch(err => console.warn('API bulkMarkAttendance sync:', err.message));
  }

  // Leave Management
  public getLeaveTypes(companyId?: string): LeaveType[] {
    const all = this.get<LeaveType[]>(STORAGE_KEYS.LEAVE_TYPES, []);
    return companyId ? all.filter(l => l.companyId === companyId) : all;
  }

  public cacheLeaveTypes(companyId: string, leaveTypes: LeaveType[]): void {
    const otherCompanies = this.getLeaveTypes().filter(item => item.companyId !== companyId);
    this.set(STORAGE_KEYS.LEAVE_TYPES, [...otherCompanies, ...leaveTypes]);
  }

  public ensureIndianLeaveTypes(companyId: string): LeaveType[] {
    const existing = this.getLeaveTypes(companyId);
    if (existing.length) return existing;

    const defaults: LeaveType[] = [
      { id: `lt-${companyId}-pl`, companyId, name: 'Privilege Leave (PL/EL)', code: 'PL', daysAllowedPerYear: 18, isPaid: true, color: '#3b82f6' },
      { id: `lt-${companyId}-cl`, companyId, name: 'Casual Leave (CL)', code: 'CL', daysAllowedPerYear: 12, isPaid: true, color: '#10b981' },
      { id: `lt-${companyId}-sl`, companyId, name: 'Sick & Medical Leave (SL)', code: 'SL', daysAllowedPerYear: 10, isPaid: true, color: '#ef4444' },
      { id: `lt-${companyId}-ml`, companyId, name: 'Maternity Leave', code: 'ML', daysAllowedPerYear: 182, isPaid: true, color: '#ec4899' },
      { id: `lt-${companyId}-lop`, companyId, name: 'Loss of Pay (LOP)', code: 'LOP', daysAllowedPerYear: 365, isPaid: false, color: '#64748b' },
    ];
    this.cacheLeaveTypes(companyId, defaults);
    return defaults;
  }

  public getLeaveRequests(companyId?: string): LeaveRequest[] {
    const all = this.get<LeaveRequest[]>(STORAGE_KEYS.LEAVE_REQUESTS, []);
    return companyId ? all.filter(r => r.companyId === companyId) : all;
  }

  public cacheLeaveRequests(companyId: string, requests: LeaveRequest[]): void {
    const otherCompanies = this.getLeaveRequests().filter(item => item.companyId !== companyId);
    this.set(STORAGE_KEYS.LEAVE_REQUESTS, [...otherCompanies, ...requests]);
  }

  public saveLeaveRequest(req: LeaveRequest): void {
    const all = this.getLeaveRequests();
    const idx = all.findIndex(r => r.id === req.id);
    if (idx >= 0) {
      all[idx] = req;
    } else {
      all.push(req);
    }
    this.set(STORAGE_KEYS.LEAVE_REQUESTS, all);

    api.applyLeave(req).catch(err => console.warn('API applyLeave sync:', err.message));
  }

  public reviewLeaveRequest(req: LeaveRequest, reviewerUserId: string): void {
    const all = this.getLeaveRequests();
    const idx = all.findIndex(item => item.id === req.id);
    if (idx >= 0) all[idx] = req;
    else all.push(req);
    this.set(STORAGE_KEYS.LEAVE_REQUESTS, all);
    api.reviewLeave(req.id, req.status, req.approvedBy || '', reviewerUserId, req.reviewerComment)
      .catch(err => console.warn('API reviewLeave sync:', err.message));
  }

  // Payroll
  public getPayrollRuns(companyId?: string): PayrollRun[] {
    const all = this.get<PayrollRun[]>(STORAGE_KEYS.PAYROLL_RUNS, []);
    return companyId ? all.filter(p => p.companyId === companyId) : all;
  }

  public savePayrollRun(run: PayrollRun): void {
    const all = this.getPayrollRuns();
    const idx = all.findIndex(p => p.id === run.id);
    if (idx >= 0) {
      all[idx] = run;
    } else {
      all.push(run);
    }
    this.set(STORAGE_KEYS.PAYROLL_RUNS, all);
  }

  public getPayslips(companyId?: string): Payslip[] {
    const all = this.get<Payslip[]>(STORAGE_KEYS.PAYSLIPS, []);
    return companyId ? all.filter(p => p.companyId === companyId) : all;
  }

  public savePayslip(payslip: Payslip): void {
    const all = this.getPayslips();
    const idx = all.findIndex(p => p.id === payslip.id);
    if (idx >= 0) {
      all[idx] = payslip;
    } else {
      all.push(payslip);
    }
    this.set(STORAGE_KEYS.PAYSLIPS, all);
  }

  // Recruitment
  public getJobPostings(companyId?: string): JobPosting[] {
    const all = this.get<JobPosting[]>(STORAGE_KEYS.JOB_POSTINGS, []);
    return companyId ? all.filter(j => j.companyId === companyId) : all;
  }

  public saveJobPosting(job: JobPosting): void {
    const all = this.getJobPostings();
    const idx = all.findIndex(j => j.id === job.id);
    if (idx >= 0) {
      all[idx] = job;
    } else {
      all.push(job);
    }
    this.set(STORAGE_KEYS.JOB_POSTINGS, all);

    api.saveJob(job).catch(err => console.warn('API saveJob sync:', err.message));
  }

  public getJobApplicants(companyId?: string): JobApplicant[] {
    const all = this.get<JobApplicant[]>(STORAGE_KEYS.JOB_APPLICANTS, []);
    return companyId ? all.filter(a => a.companyId === companyId) : all;
  }

  public saveJobApplicant(applicant: JobApplicant): void {
    const all = this.getJobApplicants();
    const idx = all.findIndex(a => a.id === applicant.id);
    if (idx >= 0) {
      all[idx] = applicant;
    } else {
      all.push(applicant);
    }
    this.set(STORAGE_KEYS.JOB_APPLICANTS, all);
  }

  // Performance Goals
  public getGoals(companyId?: string): PerformanceGoal[] {
    const all = this.get<PerformanceGoal[]>(STORAGE_KEYS.GOALS, []);
    return companyId ? all.filter(g => g.companyId === companyId) : all;
  }

  public saveGoal(goal: PerformanceGoal): void {
    const all = this.getGoals();
    const idx = all.findIndex(g => g.id === goal.id);
    if (idx >= 0) {
      all[idx] = goal;
    } else {
      all.push(goal);
    }
    this.set(STORAGE_KEYS.GOALS, all);

    api.saveGoal(goal).catch(err => console.warn('API saveGoal sync:', err.message));
  }

  // Assets
  public getAssets(companyId?: string): Asset[] {
    const all = this.get<Asset[]>(STORAGE_KEYS.ASSETS, []);
    return companyId ? all.filter(a => a.companyId === companyId) : all;
  }

  public saveAsset(asset: Asset): void {
    const all = this.getAssets();
    const idx = all.findIndex(a => a.id === asset.id);
    if (idx >= 0) {
      all[idx] = asset;
    } else {
      all.push(asset);
    }
    this.set(STORAGE_KEYS.ASSETS, all);

    api.saveAsset(asset).catch(err => console.warn('API saveAsset sync:', err.message));
  }

  // Documents
  public getDocuments(companyId?: string): CompanyDocument[] {
    const all = this.get<CompanyDocument[]>(STORAGE_KEYS.DOCUMENTS, []);
    return companyId ? all.filter(d => d.companyId === companyId) : all;
  }

  public saveDocument(doc: CompanyDocument): void {
    const all = this.getDocuments();
    all.push(doc);
    this.set(STORAGE_KEYS.DOCUMENTS, all);

    api.saveDocument(doc).catch(err => console.warn('API saveDocument sync:', err.message));
  }

  // Holidays
  public getHolidays(companyId?: string): Holiday[] {
    const all = this.get<Holiday[]>(STORAGE_KEYS.HOLIDAYS, []);
    return companyId ? all.filter(h => h.companyId === companyId) : all;
  }

  public saveHoliday(hol: Holiday): void {
    const all = this.getHolidays();
    all.push(hol);
    this.set(STORAGE_KEYS.HOLIDAYS, all);

    api.saveHoliday(hol).catch(err => console.warn('API saveHoliday sync:', err.message));
  }

  // Announcements
  public getAnnouncements(companyId?: string): Announcement[] {
    const all = this.get<Announcement[]>(STORAGE_KEYS.ANNOUNCEMENTS, []);
    return companyId ? all.filter(a => a.companyId === companyId) : all;
  }

  public saveAnnouncement(ann: Announcement): void {
    const all = this.getAnnouncements();
    all.unshift(ann);
    this.set(STORAGE_KEYS.ANNOUNCEMENTS, all);

    api.saveAnnouncement(ann).catch(err => console.warn('API saveAnnouncement sync:', err.message));
  }

  // Expenses
  public getExpenses(companyId?: string): ExpenseClaim[] {
    const all = this.get<ExpenseClaim[]>(STORAGE_KEYS.EXPENSES, []);
    return companyId ? all.filter(e => e.companyId === companyId) : all;
  }

  public saveExpense(exp: ExpenseClaim): void {
    const all = this.getExpenses();
    const idx = all.findIndex(e => e.id === exp.id);
    if (idx >= 0) {
      all[idx] = exp;
    } else {
      all.unshift(exp);
    }
    this.set(STORAGE_KEYS.EXPENSES, all);

    api.submitExpense(exp).catch(err => console.warn('API submitExpense sync:', err.message));
  }

  // Audit Logs
  public getAuditLogs(companyId?: string): AuditLog[] {
    const all = this.get<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
    return companyId ? all.filter(l => l.companyId === companyId) : all;
  }

  public logAudit(log: Omit<AuditLog, 'id'>): void {
    const all = this.getAuditLogs();
    const newLog: AuditLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    };
    all.unshift(newLog);
    this.set(STORAGE_KEYS.AUDIT_LOGS, all.slice(0, 500));

    api.logAudit(newLog).catch(err => console.warn('API logAudit sync:', err.message));
  }

  // Settings
  public getSettings(companyId: string): CompanySettings {
    const all = this.get<CompanySettings[]>(STORAGE_KEYS.SETTINGS, []);
    const found = all.find(s => s.companyId === companyId);
    if (found) return found;

    const defaultSettings: CompanySettings = {
      id: `set-${companyId}`,
      companyId: companyId,
      companyName: 'Company Workspace',
      legalEntityName: 'Company Workspace Private Limited',
      taxRegistrationNumber: 'TAX-00000000',
      currency: 'INR',
      currencySymbol: '₹',
      timezone: 'Asia/Kolkata (IST)',
      workDays: [1, 2, 3, 4, 5],
      businessHoursStart: '09:00',
      businessHoursEnd: '18:00',
      enableAutomaticOvertime: true,
      enableAuditLogging: true,
      defaultProbationPeriodMonths: 3,
    };
    all.push(defaultSettings);
    this.set(STORAGE_KEYS.SETTINGS, all);
    return defaultSettings;
  }

  public saveSettings(settings: CompanySettings): void {
    const all = this.get<CompanySettings[]>(STORAGE_KEYS.SETTINGS, []);
    const idx = all.findIndex(s => s.companyId === settings.companyId);
    if (idx >= 0) {
      all[idx] = settings;
    } else {
      all.push(settings);
    }
    this.set(STORAGE_KEYS.SETTINGS, all);

    api.saveSettings(settings.companyId, settings).catch(err => console.warn('API saveSettings sync:', err.message));
  }
}

export const storageService = new StorageService();
