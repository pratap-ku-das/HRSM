import { describe, expect, it } from 'vitest';
import { employeeScopeFilters } from './accessScope.js';

const legacy = { SUPER_ADMIN: ['employee.read.all'], COMPANY_ADMIN: ['employee.read.all'], HR_MANAGER: ['employee.read.all'], PAYROLL_ADMIN: ['employee.read.all'], MANAGER: ['employee.read.team'], DEPT_HEAD: ['employee.read.team'], EMPLOYEE: ['employee.read.self'] };

const auth = (overrides: Record<string, unknown>) => ({ id: 'u1', companyId: 'tenant-a', role: 'EMPLOYEE', employeeId: 'e1', permissions: [], accessScopes: [], tokenVersion: 0, ...overrides } as never);

describe('employee scope enforcement', () => {
  it('limits a department grant to that department', () => {
    expect(employeeScopeFilters(auth({ permissions: ['employee.read.all'], accessScopes: [{ scope: 'DEPARTMENT', scopeEntityId: 'dept-a', permissions: ['employee.read.all'] }] }), legacy)).toContainEqual({ departmentId: 'dept-a' });
    expect(employeeScopeFilters(auth({ permissions: ['employee.read.all'], accessScopes: [{ scope: 'DEPARTMENT', scopeEntityId: 'dept-a', permissions: ['employee.read.all'] }] }), legacy)).not.toContainEqual({ companyId: 'tenant-a' });
  });
  it('limits manager and self access to reporting lines and own profile', () => {
    expect(employeeScopeFilters(auth({ role: 'MANAGER', permissions: ['employee.read.team', 'employee.read.self'] }), legacy)).toEqual([{ id: 'e1' }, { reportingManagerId: 'e1' }]);
  });
  it('keeps a legacy company administrator company-wide even with scoped grants', () => {
    expect(employeeScopeFilters(auth({ role: 'COMPANY_ADMIN', permissions: ['employee.read.all'], accessScopes: [{ scope: 'TEAM', scopeEntityId: 'team-a', permissions: ['employee.read.all'] }] }), legacy)).toContainEqual({ companyId: 'tenant-a' });
  });
});
