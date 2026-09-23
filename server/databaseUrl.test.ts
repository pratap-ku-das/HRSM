import { describe, expect, it } from 'vitest';
import { normalizeDatabaseUrl } from './databaseUrl.js';

describe('normalizeDatabaseUrl', () => {
  it('removes Railway value-field quotes', () => {
    expect(normalizeDatabaseUrl('"postgresql://user:pass@example.com:5432/postgres"'))
      .toBe('postgresql://user:pass@example.com:5432/postgres');
  });

  it('removes an accidentally pasted variable assignment', () => {
    expect(normalizeDatabaseUrl('DATABASE_URL=postgresql://user:pass@example.com:5432/postgres'))
      .toBe('postgresql://user:pass@example.com:5432/postgres');
  });

  it('configures a Supabase transaction pooler for Prisma', () => {
    expect(normalizeDatabaseUrl('postgresql://user:pass@example.com:6543/postgres'))
      .toBe('postgresql://user:pass@example.com:6543/postgres?pgbouncer=true&connection_limit=1');
  });

  it('enforces SSL and production-safe timeouts for AWS RDS', () => {
    expect(normalizeDatabaseUrl('postgresql://user:pass@example.rds.amazonaws.com:5432/hrms'))
      .toBe('postgresql://user:pass@example.rds.amazonaws.com:5432/hrms?sslmode=require&connect_timeout=10&pool_timeout=10');
  });

  it('preserves explicit AWS RDS connection parameters', () => {
    expect(normalizeDatabaseUrl('postgresql://user:pass@example.rds.amazonaws.com:5432/hrms?sslmode=verify-full&connect_timeout=5&pool_timeout=20'))
      .toBe('postgresql://user:pass@example.rds.amazonaws.com:5432/hrms?sslmode=verify-full&connect_timeout=5&pool_timeout=20');
  });
});
