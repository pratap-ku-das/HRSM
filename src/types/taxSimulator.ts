export interface TaxSlabComputation {
  slab: string;
  ratePercent: number;
  taxableInSlab: number;
  taxAmount: number;
}

export interface RegimeTaxBreakdown {
  regime: 'NEW' | 'OLD';
  grossSalary: number;
  standardDeduction: number;
  totalExemptionsAndDeductions: number;
  deductionsBreakdown: Record<string, number>;
  netTaxableIncome: number;
  slabWiseTax: TaxSlabComputation[];
  taxBeforeRebate: number;
  section87ARebate: number;
  taxAfterRebate: number;
  surcharge?: number;
  surchargeMarginalRelief?: number;
  cess: number;
  totalAnnualTax: number;
  monthlyEstimatedTds: number;
  monthlyNetTakeHome: number;
}

export interface TaxSimulationComparisonResult {
  financialYear: string;
  assessmentYear: string;
  grossSalary: number;
  oldRegime: RegimeTaxBreakdown;
  newRegime: RegimeTaxBreakdown;
  comparison: {
    recommendedRegime: 'NEW' | 'OLD' | 'EQUAL';
    annualTaxDifference: number;
    monthlyTakeHomeDifference: number;
    recommendationSummary: string;
  };
}

export interface SalaryBreakdownInput {
  annualCtc?: number;
  basicSalary: number;
  hra: number;
  specialAllowance?: number;
  otherAllowances?: number;
  bonusVariable?: number;
  employerPf?: number;
  employerNps?: number;
  employeePf?: number;
  professionalTax?: number;
}

export interface DeductionDeclarationInput {
  rentPaidAnnual?: number;
  isMetro?: boolean;
  section80C?: number;
  section80DSelf?: number;
  section80DParents?: number;
  section80CCD1B?: number;
  section24bHomeLoanInterest?: number;
  otherExemptions?: number;
}

export interface TaxSimulationPayload {
  financialYear?: string;
  employeeId?: string;
  salary?: SalaryBreakdownInput;
  declarations?: DeductionDeclarationInput;
}

export interface ApplyTaxRegimePayload {
  employeeId?: string;
  financialYear: string;
  regime: 'NEW' | 'OLD';
  confirmedSalary?: Record<string, number>;
  notes?: string;
}
