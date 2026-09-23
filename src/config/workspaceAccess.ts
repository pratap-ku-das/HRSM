import type { User } from '../types';

const rules: Record<string, string[]> = {
  dashboard: [],
  notifications: [],
  'security-center': [],
  assets: [],
  documents: [],
  holidays: [],
  'my-attendance': ['attendance.read.self'],
  'my-leave': ['leave.apply'],
  'my-pay': ['payslip.read.self'],
  'my-expenses': ['expense.submit'],
  'attendance-requests': ['attendance.read.self'],
  approvals: ['workflow.review'],
  employees: ['employee.manage', 'employee.read.all', 'employee.read.team'],
  'command-center': ['employee.read.all'],
  departments: ['organization.read'],
  attendance: ['attendance.read.team'],
  leaves: ['leave.review'],
  payroll: ['payroll.manage'],
  expenses: ['expense.review'],
  recruitment: ['recruitment.manage'],
  performance: ['performance.manage', 'performance.review', 'goal.manage.team'],
  workflows: ['workflow.manage'],
  'attendance-policy': ['attendance.manage'],
  foundation: ['rbac.manage'],
  audit: ['audit.read'],
  governance: ['audit.read'],
  settings: ['company.manage'],
};

export const hasPermission = (user: User | null | undefined, permission: string) =>
  Boolean(user?.permissions?.includes(permission));

export const canAccessView = (user: User | null | undefined, view: string) => {
  if (!user) return false;
  const required = rules[view];
  return required ? required.length === 0 || required.some(permission => hasPermission(user, permission)) : false;
};

export const workspaceKind = (user: User | null | undefined) => {
  if (!user) return 'employee' as const;
  if (user.role === 'SUPER_ADMIN') return 'super-admin' as const;
  if (['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_ADMIN'].includes(user.role)) return 'admin' as const;
  if (['MANAGER', 'DEPT_HEAD'].includes(user.role)) return 'manager' as const;
  return 'employee' as const;
};

export const workspaceTitle = (user: User | null | undefined) => ({
  employee: 'My workspace',
  manager: 'Manager workspace',
  admin: 'Workforce administration',
  'super-admin': 'Organization control',
}[workspaceKind(user)]);
