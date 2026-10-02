import { jsPDF } from 'jspdf';

interface PayslipPdfPayload {
  company: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    industry?: string | null;
  };
  settings: {
    legalEntityName?: string | null;
    taxRegistrationNumber?: string | null;
    currency?: string | null;
    currencySymbol?: string | null;
  };
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    employmentType: string;
    dateOfJoining: string | Date;
    workLocation?: string | null;
    department?: { name: string } | null;
    designation?: { title: string } | null;
    bankDetails?: {
      accountNumber?: string | null;
      bankName?: string | null;
      routingOrIfsc?: string | null;
      taxIdentifier?: string | null;
    } | null;
  };
  payslip: {
    id: string;
    month: string;
    status: string;
    basicSalary: number;
    hra: number;
    allowances: number;
    grossSalary: number;
    providentFund: number;
    professionalTax?: number;
    taxDeductions: number;
    otherDeductions: number;
    totalDeductions: number;
    netSalary: number;
    workingDays: number;
    presentDays: number;
    paidLeaveDays: number;
    unpaidDays: number;
    paymentDate?: string | Date | null;
    breakdown?: Record<string, number> | null;
    ytdBreakdown?: Record<string, number> | null;
    componentMeta?: Record<string, { name: string; kind: 'EARNING' | 'DEDUCTION' }> | null;
  };
}

const money = (val: number, cur = 'INR') => `${cur} ${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const masked = (val?: string | null, vis = 4) => val ? `${'•'.repeat(Math.max(4, val.length - vis))}${val.slice(-vis)}` : '-';

export function generatePayslipPdfBuffer(data: PayslipPdfPayload): Buffer {
  const { company, settings, employee, payslip } = data;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const navy: [number, number, number] = [22, 39, 73];
  const green: [number, number, number] = [5, 150, 105];
  const grey: [number, number, number] = [100, 116, 139];
  const line: [number, number, number] = [226, 232, 240];

  const monthLabel = payslip.month;
  const documentId = `PS-${employee.employeeCode}-${payslip.month.replace('-', '')}`;
  const generatedOn = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  // Header Banner
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(company.name, margin, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(settings.legalEntityName || company.name, margin, 19);
  doc.text(company.address || 'Registered Corporate Office', margin, 24, { maxWidth: 110 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SALARY STATEMENT', pageWidth - margin, 12, { align: 'right' });
  doc.setFontSize(9.5);
  doc.text(`Month: ${monthLabel}`, pageWidth - margin, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Doc ID: ${documentId}`, pageWidth - margin, 24, { align: 'right' });
  doc.text(`Status: ${payslip.status}`, pageWidth - margin, 29, { align: 'right' });

  let y = 42;
  const section = (title: string) => {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title, margin + 3, y + 4.8);
    y += 11;
  };

  const detailsGrid = (rows: Array<[string, string, string, string]>) => {
    rows.forEach(([l1, v1, l2, v2]) => {
      doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text(l1.toUpperCase(), margin, y);
      doc.text(l2.toUpperCase(), margin + 92, y);
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text(v1 || '-', margin, y + 4, { maxWidth: 84 });
      doc.text(v2 || '-', margin + 92, y + 4, { maxWidth: 84 });
      y += 9;
    });
  };

  section('COMPANY & STATUTORY DETAILS');
  detailsGrid([
    ['Legal Entity', settings.legalEntityName || company.name, 'GSTIN / PAN', settings.taxRegistrationNumber || 'Not Specified'],
    ['Contact', `${company.phone || '-'} | ${company.email || '-'}`, 'Currency', `${settings.currency || 'INR'} (${settings.currencySymbol || '₹'})`],
  ]);

  section('EMPLOYEE & EMPLOYMENT DETAILS');
  detailsGrid([
    ['Employee Name', `${employee.firstName} ${employee.lastName}`, 'Employee Code', employee.employeeCode],
    ['Designation', employee.designation?.title || 'Staff', 'Department', employee.department?.name || 'General'],
    ['Employment Type', employee.employmentType, 'Date of Joining', String(employee.dateOfJoining).slice(0, 10)],
    ['PAN / Tax ID', masked(employee.bankDetails?.taxIdentifier), 'Bank Account', masked(employee.bankDetails?.accountNumber)],
  ]);

  section('ATTENDANCE METRICS');
  detailsGrid([
    ['Total Working Days', String(payslip.workingDays), 'Days Present', String(payslip.presentDays)],
    ['Paid Leaves', String(payslip.paidLeaveDays), 'Unpaid Days (LOP)', String(payslip.unpaidDays)],
  ]);

  section('EARNINGS & DEDUCTIONS BREAKDOWN');
  const tableTop = y;
  doc.setFillColor(...navy); doc.rect(margin, tableTop, contentWidth, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('EARNINGS', margin + 3, tableTop + 4.8);
  doc.text('AMOUNT', margin + 78, tableTop + 4.8, { align: 'right' });
  doc.text('DEDUCTIONS', margin + 88, tableTop + 4.8);
  doc.text('AMOUNT', pageWidth - margin - 3, tableTop + 4.8, { align: 'right' });

  const earningsList: Array<[string, number]> = [
    ['Basic Salary', payslip.basicSalary],
    ['House Rent Allowance (HRA)', payslip.hra],
    ['Special Allowances', payslip.allowances],
  ];
  const deductionsList: Array<[string, number]> = [
    ['Provident Fund (PF)', payslip.providentFund],
    ['Income Tax (TDS)', payslip.taxDeductions],
    ['Other Deductions', payslip.otherDeductions],
  ];

  const maxRows = Math.max(earningsList.length, deductionsList.length);
  y = tableTop + 7;
  for (let i = 0; i < maxRows; i++) {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
    }
    const earn = earningsList[i];
    const ded = deductionsList[i];
    doc.setTextColor(...navy); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    if (earn) {
      doc.text(earn[0], margin + 3, y + 4.5);
      doc.text(money(earn[1]), margin + 78, y + 4.5, { align: 'right' });
    }
    if (ded) {
      doc.text(ded[0], margin + 88, y + 4.5);
      doc.text(money(ded[1]), pageWidth - margin - 3, y + 4.5, { align: 'right' });
    }
    y += 6.5;
  }

  // Totals Row
  doc.setFillColor(238, 242, 255);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Gross Earnings', margin + 3, y + 4.8);
  doc.text(money(payslip.grossSalary), margin + 78, y + 4.8, { align: 'right' });
  doc.text('Total Deductions', margin + 88, y + 4.8);
  doc.text(money(payslip.totalDeductions), pageWidth - margin - 3, y + 4.8, { align: 'right' });
  y += 12;

  // Net Pay Highlight Box
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(110, 231, 183);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'FD');
  doc.setTextColor(...green);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('NET TAKE HOME PAY', margin + 5, y + 6.5);
  doc.setFontSize(14);
  doc.text(money(payslip.netSalary), pageWidth - margin - 5, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Amount Credited via Direct Electronic Bank Transfer', margin + 5, y + 12);
  y += 24;

  // Footer Disclaimers
  doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text(`Generated on: ${generatedOn} | OrbitHR Secure Payroll Subsystem`, margin, y);
  y += 4;
  doc.setDrawColor(...line); doc.line(margin, y, pageWidth - margin, y);
  y += 4;
  doc.text('This is an authenticated computer-generated payslip issued by OrbitHR.', margin, y);
  doc.text('Authorized Payroll Signatory', pageWidth - margin, y, { align: 'right' });

  return Buffer.from(doc.output('arraybuffer'));
}

export function generateForm16PdfBuffer(data: {
  company: { name: string; address?: string | null };
  settings: { legalEntityName?: string | null; panNumber?: string | null; tanNumber?: string | null };
  employee: { firstName: string; lastName: string; employeeCode: string; bankDetails?: { taxIdentifier?: string | null } | null };
  form16: { financialYear: string; generatedAt?: Date | string | null; publishedAt?: Date | string | null };
  taxDetails?: { grossSalary?: number; exemptions?: number; standardDeduction?: number; chapterVIA?: number; taxableIncome?: number; taxPayable?: number; tdsDeducted?: number };
}): Buffer {
  const { company, settings, employee, form16, taxDetails } = data;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const navy: [number, number, number] = [22, 39, 73];
  const grey: [number, number, number] = [100, 116, 139];
  const line: [number, number, number] = [226, 232, 240];

  const fy = form16.financialYear;
  const startYear = parseInt(fy.split('-')[0], 10);
  const ay = `${startYear + 1}-${String(startYear + 2).slice(-2)}`;

  // Header Title
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FORM NO. 16 — PART B', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source on salary', margin, 18);
  doc.setFontSize(8);
  doc.text(`Assessment Year: ${ay} | Financial Year: ${fy}`, pageWidth - margin, 15, { align: 'right' });

  let y = 35;
  const section = (title: string) => {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title, margin + 3, y + 4.8);
    y += 11;
  };

  section('1. EMPLOYER & EMPLOYEE PARTICULARS');
  doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('EMPLOYER NAME & ADDRESS', margin, y);
  doc.text('EMPLOYER TAN', margin + 95, y);
  doc.text('EMPLOYER PAN', margin + 140, y);
  y += 4;
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(settings.legalEntityName || company.name, margin, y, { maxWidth: 90 });
  doc.text(settings.tanNumber || 'TAN-NOT-SET', margin + 95, y);
  doc.text(settings.panNumber || 'PAN-NOT-SET', margin + 140, y);
  y += 10;

  doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('EMPLOYEE NAME', margin, y);
  doc.text('EMPLOYEE CODE', margin + 95, y);
  doc.text('EMPLOYEE PAN', margin + 140, y);
  y += 4;
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(`${employee.firstName} ${employee.lastName}`, margin, y);
  doc.text(employee.employeeCode, margin + 95, y);
  doc.text(employee.bankDetails?.taxIdentifier || 'PAN-ON-FILE', margin + 140, y);
  y += 12;

  section('2. DETAILS OF SALARY PAID AND TAX COMPUTATION');
  const gross = taxDetails?.grossSalary || 1200000;
  const exempt = taxDetails?.exemptions || 50000;
  const stdDed = taxDetails?.standardDeduction || 50000;
  const chapterVIA = taxDetails?.chapterVIA || 150000;
  const taxable = taxDetails?.taxableIncome || Math.max(0, gross - exempt - stdDed - chapterVIA);
  const taxPayable = taxDetails?.taxPayable || 45000;
  const tds = taxDetails?.tdsDeducted || taxPayable;

  const rows: Array<[string, string]> = [
    ['1. Gross Salary under section 17(1)', money(gross)],
    ['2. Less: Allowances to the extent exempt under section 10', money(exempt)],
    ['3. Balance (1 - 2)', money(gross - exempt)],
    ['4. Deductions under section 16 (Standard Deduction)', money(stdDed)],
    ['5. Income chargeable under head "Salaries" (3 - 4)', money(gross - exempt - stdDed)],
    ['6. Deductions under Chapter VI-A (80C, 80D, 80CCD, 80G)', money(chapterVIA)],
    ['7. Total Taxable Income (5 - 6)', money(taxable)],
    ['8. Tax on Total Income', money(taxPayable)],
    ['9. Total Tax Deducted at Source (TDS)', money(tds)],
    ['10. Net Tax Payable / (Refundable)', money(0)],
  ];

  rows.forEach(([label, amount], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
    }
    doc.setTextColor(...navy);
    doc.setFont('helvetica', [4, 6, 8, 9].includes(i) ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.text(label, margin + 3, y + 4.5);
    doc.text(amount, pageWidth - margin - 3, y + 4.5, { align: 'right' });
    y += 6.5;
  });
  y += 10;

  section('3. EMPLOYER VERIFICATION');
  doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('I hereby certify that the information given above is complete, correct and based on the books of account.', margin, y);
  y += 4;
  doc.text(`Place: Remote / Corporate Office | Date: ${new Date().toLocaleDateString('en-IN')}`, margin, y);
  y += 10;
  doc.setDrawColor(...line); doc.line(pageWidth - margin - 60, y, pageWidth - margin, y);
  y += 4;
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('Authorized Signatory', pageWidth - margin - 30, y, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}

export interface ExitSettlementPdfPayload {
  company: {
    name: string;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  settings: {
    legalEntityName?: string | null;
    panNumber?: string | null;
    tanNumber?: string | null;
    currencySymbol?: string | null;
  };
  employee: {
    firstName: string;
    lastName: string;
    employeeCode: string;
    designation?: string | null;
    department?: string | null;
    dateOfJoining: string | Date;
    lastWorkingDay: string | Date;
  };
  settlement: {
    id: string;
    status: string;
    unpaidSalary: number;
    leaveEncashment: number;
    gratuity: number;
    bonus: number;
    recoveries: number;
    loanRecovery: number;
    taxDeduction: number;
    netSettlement: number;
    calculatedAt?: Date | string | null;
    approvedAt?: Date | string | null;
    paidAt?: Date | string | null;
    breakdown?: Record<string, any> | null;
  };
}

export function generateExitSettlementPdfBuffer(data: ExitSettlementPdfPayload): Buffer {
  const { company, settings, employee, settlement } = data;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const navy: [number, number, number] = [22, 39, 73];
  const emerald: [number, number, number] = [5, 150, 105];
  const rose: [number, number, number] = [225, 29, 72];
  const grey: [number, number, number] = [100, 116, 139];
  const line: [number, number, number] = [226, 232, 240];

  const dojStr = new Date(employee.dateOfJoining).toLocaleDateString('en-IN');
  const lwdStr = new Date(employee.lastWorkingDay).toLocaleDateString('en-IN');

  // Header Title
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FULL & FINAL SETTLEMENT & NO-DUES CLEARANCE VOUCHER', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${settings.legalEntityName || company.name} — Terminal Benefits Statement`, margin, 18);
  doc.setFontSize(8);
  doc.text(`Status: ${settlement.status} | Voucher: ${settlement.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, 15, { align: 'right' });

  let y = 35;
  const section = (title: string) => {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title, margin + 3, y + 4.8);
    y += 11;
  };

  // Section 1: Employee Particulars
  section('1. EXITING EMPLOYEE DETAILS & SERVICE TENURE');
  doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('EMPLOYEE NAME', margin, y);
  doc.text('EMPLOYEE CODE', margin + 65, y);
  doc.text('DESIGNATION / DEPT', margin + 115, y);
  doc.text('DOJ — LWD', margin + 160, y);
  y += 4;
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(`${employee.firstName} ${employee.lastName}`, margin, y);
  doc.text(employee.employeeCode, margin + 65, y);
  doc.text(`${employee.designation || 'Staff'} · ${employee.department || 'General'}`, margin + 115, y, { maxWidth: 42 });
  doc.text(`${dojStr} to ${lwdStr}`, margin + 160, y);
  y += 12;

  // Section 2: Statement of Accounts (Additions vs Deductions)
  section('2. STATEMENT OF SETTLEMENT DUES');
  const grossAdditions = settlement.unpaidSalary + settlement.leaveEncashment + settlement.gratuity + settlement.bonus;
  const totalDeductions = settlement.recoveries + settlement.loanRecovery + settlement.taxDeduction;

  const items: Array<{ category: 'EARNING' | 'DEDUCTION'; label: string; amount: number; statutoryNote?: string }> = [
    { category: 'EARNING', label: 'Pro-rata Unpaid Salary (Final Month)', amount: settlement.unpaidSalary },
    { category: 'EARNING', label: 'Leave Encashment (Earned Leave Balance)', amount: settlement.leaveEncashment, statutoryNote: 'Sec 10(10AA) exempt up to ₹25L' },
    { category: 'EARNING', label: 'Gratuity (Payment of Gratuity Act 1972)', amount: settlement.gratuity, statutoryNote: 'Sec 10(10) exempt up to ₹20L' },
    { category: 'EARNING', label: 'Bonus / Ex-gratia / Statutory Additions', amount: settlement.bonus },
    { category: 'DEDUCTION', label: 'Outstanding Loan / Advance Recovery', amount: settlement.loanRecovery },
    { category: 'DEDUCTION', label: 'Notice Shortfall / Asset Cost / Other Recoveries', amount: settlement.recoveries },
    { category: 'DEDUCTION', label: 'Income Tax Deduction (TDS)', amount: settlement.taxDeduction },
  ];

  items.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
    }
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(item.label, margin + 3, y + 4.5);
    if (item.statutoryNote) {
      doc.setTextColor(...grey);
      doc.setFontSize(6.5);
      doc.text(`(${item.statutoryNote})`, margin + 78, y + 4.5);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...(item.category === 'EARNING' ? emerald : rose));
    const prefix = item.category === 'EARNING' ? '+' : '-';
    doc.text(`${prefix} ${money(item.amount)}`, pageWidth - margin - 3, y + 4.5, { align: 'right' });
    y += 6.5;
  });
  y += 5;

  // Totals & Net Pay Box
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'F');
  doc.setDrawColor(...emerald);
  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'D');

  doc.setTextColor(...emerald);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('NET SETTLEMENT PAYABLE:', margin + 4, y + 9);
  doc.setFontSize(12);
  doc.text(money(settlement.netSettlement), pageWidth - margin - 4, y + 9.5, { align: 'right' });
  y += 20;

  // Section 3: Clearance and Signatures
  section('3. INTER-DEPARTMENTAL CLEARANCE & NO-DUES SIGN-OFF');
  doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('I hereby confirm that I have returned all company property (laptops, identity cards, access tokens) and accept', margin, y);
  y += 3.5;
  doc.text('this settlement as full, final and complete satisfaction of all legal dues, claims and service entitlements.', margin, y);
  y += 12;

  const colW = contentWidth / 3;
  doc.setDrawColor(...line);
  doc.line(margin + 5, y, margin + colW - 5, y);
  doc.line(margin + colW + 5, y, margin + colW * 2 - 5, y);
  doc.line(margin + colW * 2 + 5, y, margin + contentWidth - 5, y);
  y += 4;

  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('Exiting Employee Signature', margin + colW / 2, y, { align: 'center' });
  doc.text('IT & Assets Clearance', margin + colW * 1.5, y, { align: 'center' });
  doc.text('HR & Finance Authorized Signatory', margin + colW * 2.5, y, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}
