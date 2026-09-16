import type { UserRole } from '@prisma/client';

export type AccessScope = { scope: 'ALL_COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'TEAM' | 'SELF'; scopeEntityId?: string | null; permissions: string[] };
export type ScopeAuth = { companyId: string; role: UserRole; employeeId?: string; permissions: string[]; accessScopes: AccessScope[] };

export function employeeScopeFilters(auth: ScopeAuth, legacyPermissions: Record<UserRole, string[]>): Record<string, unknown>[] {
  const filters: Record<string, unknown>[] = [];
  if (legacyPermissions[auth.role].includes('employee.read.all')) filters.push({ companyId: auth.companyId });
  if (auth.permissions.includes('employee.read.self') && auth.employeeId) filters.push({ id: auth.employeeId });
  if (auth.permissions.includes('employee.read.team') && auth.employeeId) filters.push({ reportingManagerId: auth.employeeId });
  for (const grant of auth.accessScopes.filter(value => value.permissions.some(permission => permission.startsWith('employee.read')))) {
    if (grant.scope === 'ALL_COMPANY') filters.push({ companyId: auth.companyId });
    if (grant.scope === 'BRANCH' && grant.scopeEntityId) filters.push({ branchId: grant.scopeEntityId });
    if (grant.scope === 'DEPARTMENT' && grant.scopeEntityId) filters.push({ departmentId: grant.scopeEntityId });
    if (grant.scope === 'TEAM' && grant.scopeEntityId) filters.push({ teamId: grant.scopeEntityId });
    if (grant.scope === 'SELF' && auth.employeeId) filters.push({ id: auth.employeeId });
  }
  return filters;
}
