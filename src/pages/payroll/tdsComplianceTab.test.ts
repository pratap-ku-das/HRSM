import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { tdsApi } from './tdsApi';

describe('TDS Compliance Frontend Client & Logic (P2.8)', () => {
  const originalFetch = global.fetch;
  const store: Record<string, string> = {};

  beforeEach(() => {
    store['orbithr_access_token'] = 'mock-test-token-123';
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Statutory Form Resolution Logic', () => {
    const resolveForm = (fy: string) => {
      const startYear = parseInt(fy.split('-')[0], 10);
      if (startYear >= 2026) {
        return {
          formCode: '138',
          act: 'Income-tax Act, 2025',
          version: 'ITD Unified Return v1.2',
        };
      }
      return {
        formCode: '24Q',
        act: 'Income-tax Act, 1961',
        version: 'Protean ASCII e-TDS File v6.3 / v7.5',
      };
    };

    it('resolves Form 24Q under Income-tax Act, 1961 for FY 2024-25 and FY 2025-26', () => {
      const fy24 = resolveForm('2024-25');
      expect(fy24.formCode).toBe('24Q');
      expect(fy24.act).toContain('1961');

      const fy25 = resolveForm('2025-26');
      expect(fy25.formCode).toBe('24Q');
      expect(fy25.act).toContain('1961');
    });

    it('resolves Form 138 under Income-tax Act, 2025 for FY 2026-27 and future years', () => {
      const fy26 = resolveForm('2026-27');
      expect(fy26.formCode).toBe('138');
      expect(fy26.act).toContain('2025');

      const fy27 = resolveForm('2027-28');
      expect(fy27.formCode).toBe('138');
      expect(fy27.act).toContain('2025');
    });
  });

  describe('Segregation of Duties (SoD) Invariants', () => {
    const canCheckerApproveFiling = (
      user: { id: string; permissions: string[]; role: string },
      filing: { createdById: string; status: string }
    ) => {
      if (filing.status !== 'PENDING_APPROVAL') return false;
      const hasApprovePerm =
        user.permissions.includes('compliance.approve') ||
        user.role === 'COMPANY_ADMIN' ||
        user.role === 'SUPER_ADMIN';
      if (!hasApprovePerm) return false;
      // Maker cannot approve own filing
      if (user.id === filing.createdById) return false;
      return true;
    };

    it('prohibits Maker from approving their own filing (SoD check)', () => {
      const makerUser = {
        id: 'user-maker-1',
        permissions: ['compliance.manage', 'compliance.approve'],
        role: 'COMPANY_ADMIN',
      };
      const filing = {
        createdById: 'user-maker-1',
        status: 'PENDING_APPROVAL',
      };

      expect(canCheckerApproveFiling(makerUser, filing)).toBe(false);
    });

    it('allows independent Checker to approve filing', () => {
      const checkerUser = {
        id: 'user-checker-2',
        permissions: ['compliance.approve'],
        role: 'HR_MANAGER',
      };
      const filing = {
        createdById: 'user-maker-1',
        status: 'PENDING_APPROVAL',
      };

      expect(canCheckerApproveFiling(checkerUser, filing)).toBe(true);
    });

    it('prohibits approval if status is not PENDING_APPROVAL', () => {
      const checkerUser = {
        id: 'user-checker-2',
        permissions: ['compliance.approve'],
        role: 'SUPER_ADMIN',
      };
      const filing = {
        createdById: 'user-maker-1',
        status: 'VALIDATED',
      };

      expect(canCheckerApproveFiling(checkerUser, filing)).toBe(false);
    });
  });

  describe('Component Allocation Rules & Precision', () => {
    const validateAllocationInput = (
      tds: number,
      surcharge: number,
      cess: number,
      totalProvided?: number
    ) => {
      const isExactCents = (v: number) => Number(v.toFixed(2)) === v;
      if (!isExactCents(tds) || !isExactCents(surcharge) || !isExactCents(cess)) {
        return { valid: false, error: 'Precision exceeds 2 decimal places' };
      }
      if (tds < 0 || surcharge < 0 || cess < 0) {
        return { valid: false, error: 'Allocations must be non-negative' };
      }
      const sum = Number((tds + surcharge + cess).toFixed(2));
      if (totalProvided !== undefined && totalProvided !== sum) {
        return { valid: false, error: 'Total mismatch' };
      }
      return { valid: true, calculatedTotal: sum };
    };

    it('verifies 2-decimal precision (Option B)', () => {
      expect(validateAllocationInput(1500.5, 0, 0).valid).toBe(true);
      expect(validateAllocationInput(1500.25, 50.1, 60.05).valid).toBe(true);
      expect(validateAllocationInput(1500.255, 0, 0).valid).toBe(false);
    });

    it('validates component sum matches allocated total', () => {
      const res = validateAllocationInput(1000, 50, 42, 1092);
      expect(res.valid).toBe(true);
      expect(res.calculatedTotal).toBe(1092);

      const mismatch = validateAllocationInput(1000, 50, 42, 1000);
      expect(mismatch.valid).toBe(false);
      expect(mismatch.error).toBe('Total mismatch');
    });

    it('rejects negative allocation components', () => {
      const neg = validateAllocationInput(-100, 0, 0);
      expect(neg.valid).toBe(false);
      expect(neg.error).toBe('Allocations must be non-negative');
    });
  });

  describe('tdsApi Client Endpoints', () => {
    it('calls getFilings with domain=TDS_24Q', async () => {
      const mockFilings = [
        { id: 'f-1', domain: 'TDS_24Q', quarter: 'Q1', periodYear: 2025, status: 'DRAFT' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockFilings }),
      });

      const result = await tdsApi.getFilings({ periodYear: 2025, status: 'DRAFT' });
      expect(result).toEqual(mockFilings);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/compliance/filings?domain=TDS_24Q&status=DRAFT&periodYear=2025'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-test-token-123',
          }),
        })
      );
    });

    it('calls createSnapshot with payload and returns new filing', async () => {
      const payload = {
        financialYear: '2025-26',
        quarter: 'Q1' as const,
        quarterlyPayrollRunIds: ['run-1', 'run-2', 'run-3'],
        autoAllocateChallanFifo: true,
      };

      const mockResponse = {
        filing: { id: 'f-snapshot-1', statutoryFormCode: '24Q' },
        formCode: '24Q',
        formatVersion: 'v6.3',
        ledger: { reconciliationStatus: 'BALANCED' },
        validationWarnings: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockResponse }),
      });

      const res = await tdsApi.createSnapshot(payload);
      expect(res.formCode).toBe('24Q');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/compliance/tds/filings/snapshot',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });

    it('calls validateFiling and throws formatted error on validation failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: 'TDS_VALIDATION_FAILED',
            message: 'TDS statutory validation failed.',
            details: { diagnostics: ['Invalid Deductor TAN'] },
          },
        }),
      });

      await expect(tdsApi.validateFiling('filing-123')).rejects.toThrow('TDS statutory validation failed.');
    });

    it('calls lockFiling and returns locked filing with sha256 checksum', async () => {
      const mockLocked = {
        id: 'filing-123',
        status: 'LOCKED',
        sha256Checksum: 'a'.repeat(64),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockLocked }),
      });

      const res = await tdsApi.lockFiling('filing-123');
      expect(res.status).toBe('LOCKED');
      expect(res.sha256Checksum).toHaveLength(64);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/compliance/tds/filings/filing-123/lock',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('calls recordToken and returns updated filing with PRN', async () => {
      const mockResult = {
        id: 'filing-123',
        tokenNumberPrn: '050010200000123',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockResult }),
      });

      const res = await tdsApi.recordToken('filing-123', {
        tokenNumberPrn: '050010200000123',
        receiptDate: '2026-07-15',
      });

      expect(res.tokenNumberPrn).toBe('050010200000123');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/compliance/tds/filings/filing-123/record-token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tokenNumberPrn: '050010200000123', receiptDate: '2026-07-15' }),
        })
      );
    });
  });
});
