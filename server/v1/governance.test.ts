import { describe, expect, it } from 'vitest';
import { employeeWhere } from './governance.js';

describe('governance employee scope', () => {
  it('fails closed when no employee permission exists', () => {
    expect(employeeWhere({ companyId: 'c1', role: 'EMPLOYEE', permissions: [], accessScopes: [] })).toEqual({ companyId: 'c1', OR: [{ id: '__none__' }] });
  });
  it('limits a self reader to their own employee', () => {
    expect(employeeWhere({ companyId: 'c1', role: 'EMPLOYEE', employeeId: 'e1', permissions: ['employee.read.self'], accessScopes: [] }).OR).toContainEqual({ id: 'e1' });
  });
  it('translates stored department grants without accepting another tenant id', () => {
    const where = employeeWhere({ companyId: 'c1', role: 'EMPLOYEE', permissions: ['employee.read.self'], accessScopes: [{ scope: 'DEPARTMENT', scopeEntityId: 'd1', permissions: ['employee.read.team'] }] });
    expect(where.companyId).toBe('c1'); expect(where.OR).toContainEqual({ departmentId: 'd1' });
  });
});
