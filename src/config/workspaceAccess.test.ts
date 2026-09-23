import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { canAccessView, workspaceKind } from './workspaceAccess';

const user = (role: User['role'], permissions: string[]): User => ({
  id: 'user-1', companyId: 'company-1', email: 'person@example.com', fullName: 'Person',
  role, permissions, createdAt: '2026-09-23T00:00:00.000Z',
});

describe('workspace access', () => {
  it('keeps employees in personal self-service modules', () => {
    const employee = user('EMPLOYEE', ['employee.read.self', 'attendance.read.self', 'leave.apply', 'expense.submit', 'payslip.read.self']);
    expect(workspaceKind(employee)).toBe('employee');
    expect(canAccessView(employee, 'my-attendance')).toBe(true);
    expect(canAccessView(employee, 'employees')).toBe(false);
    expect(canAccessView(employee, 'payroll')).toBe(false);
    expect(canAccessView(employee, 'settings')).toBe(false);
  });

  it('gives managers team tools without company administration', () => {
    const manager = user('MANAGER', ['employee.read.team', 'attendance.read.team', 'workflow.review', 'performance.review']);
    expect(workspaceKind(manager)).toBe('manager');
    expect(canAccessView(manager, 'employees')).toBe(true);
    expect(canAccessView(manager, 'approvals')).toBe(true);
    expect(canAccessView(manager, 'command-center')).toBe(false);
    expect(canAccessView(manager, 'foundation')).toBe(false);
  });

  it('gives HR workforce tools without super-admin access configuration', () => {
    const hr = user('HR_MANAGER', ['employee.read.all', 'employee.manage', 'attendance.manage', 'recruitment.manage']);
    expect(workspaceKind(hr)).toBe('admin');
    expect(canAccessView(hr, 'command-center')).toBe(true);
    expect(canAccessView(hr, 'recruitment')).toBe(true);
    expect(canAccessView(hr, 'foundation')).toBe(false);
  });

  it('permits super admins to open organization and security controls', () => {
    const admin = user('SUPER_ADMIN', ['company.manage', 'rbac.manage', 'audit.read']);
    expect(workspaceKind(admin)).toBe('super-admin');
    expect(canAccessView(admin, 'settings')).toBe(true);
    expect(canAccessView(admin, 'foundation')).toBe(true);
    expect(canAccessView(admin, 'governance')).toBe(true);
  });
});
