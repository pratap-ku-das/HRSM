import type { Company, CompanySettings, Department, Designation, Employee, Payslip } from '../types';

interface PayslipPdfInput {
  company: Company;
  settings: CompanySettings;
  employee: Employee;
  department?: Department;
  designation?: Designation;
  payslip: Payslip;
}

const money = (value: number) => `INR ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const numberToWords = (value: number): string => {
  if (value === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const belowThousand = (n: number) => {
    const parts: string[] = [];
    if (n >= 100) { parts.push(`${ones[Math.floor(n / 100)]} Hundred`); n %= 100; }
    if (n >= 20) { parts.push(tens[Math.floor(n / 10)]); n %= 10; }
    if (n > 0) parts.push(ones[n]);
    return parts.join(' ');
  };
  let n = Math.floor(Math.abs(value));
  const parts: string[] = [];
  const groups: Array<[number, string]> = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']];
  groups.forEach(([size, label]) => {
    if (n >= size) { parts.push(`${belowThousand(Math.floor(n / size))} ${label}`); n %= size; }
  });
  if (n > 0) parts.push(belowThousand(n));
  return parts.join(' ');
};

const imageData = async (url?: string): Promise<string | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export async function downloadPayslipPdf({ company, settings, employee, department, designation, payslip }: PayslipPdfInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const navy: [number, number, number] = [22, 39, 73];
  const blue: [number, number, number] = [79, 70, 229];
  const green: [number, number, number] = [5, 150, 105];
  const grey: [number, number, number] = [100, 116, 139];
  const line: [number, number, number] = [226, 232, 240];
  const monthLabel = new Date(`${payslip.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const documentId = `PS-${employee.employeeCode}-${payslip.month.replace('-', '')}`;
  const generatedOn = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 38, 'F');
  const logo = await imageData(company.logoUrl || '/orbithr-logo.png');
  if (logo) {
    try { doc.addImage(logo, 'PNG', margin, 8, 25, 20, undefined, 'FAST'); } catch { /* keep text brand */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(company.name, logo ? 43 : margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(settings.legalEntityName || company.name, logo ? 43 : margin, 20);
  doc.text(company.address || '', logo ? 43 : margin, 25, { maxWidth: 105 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('SALARY PAYSLIP', pageWidth - margin, 12, { align: 'right' });
  doc.setFontSize(10);
  doc.text(monthLabel, pageWidth - margin, 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Document ID: ${documentId}`, pageWidth - margin, 25, { align: 'right' });
  doc.text(`Status: ${payslip.status}`, pageWidth - margin, 30, { align: 'right' });

  let y = 45;
  const section = (title: string) => {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'F');
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title, margin + 3, y + 5.3);
    y += 12;
  };
  const detailsGrid = (rows: Array<[string, string, string, string]>) => {
    rows.forEach(([l1, v1, l2, v2]) => {
      doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text(l1.toUpperCase(), margin, y);
      doc.text(l2.toUpperCase(), margin + 92, y);
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(v1 || '-', margin, y + 4.5, { maxWidth: 82 });
      doc.text(v2 || '-', margin + 92, y + 4.5, { maxWidth: 90 });
      y += 10;
    });
  };

  section('COMPANY & STATUTORY INFORMATION');
  detailsGrid([
    ['Legal Entity', settings.legalEntityName, 'GSTIN / PAN Registration', settings.taxRegistrationNumber],
    ['Registered Address', company.address, 'Contact', `${company.phone || '-'}  |  ${company.email}`],
    ['Industry', company.industry, 'Payroll Currency', `${settings.currency} (${settings.currencySymbol})`],
  ]);

  section('EMPLOYEE & EMPLOYMENT DETAILS');
  detailsGrid([
    ['Employee Name', `${employee.firstName} ${employee.lastName}`, 'Employee Code', employee.employeeCode],
    ['Designation', designation?.title || '-', 'Department', department?.name || '-'],
    ['Employment Type', employee.employmentType.replace('_', ' '), 'Date of Joining', new Date(`${employee.dateOfJoining}T00:00:00`).toLocaleDateString('en-IN')],
    ['Work Location', employee.workLocation, 'Email / Phone', `${employee.email}  |  ${employee.phone}`],
    ['PAN / Tax Identifier', employee.bankDetails.taxIdentifier || '-', 'Bank / IFSC', `${employee.bankDetails.bankName || '-'}  |  ${employee.bankDetails.routingOrIfsc || '-'}`],
    ['Bank Account', employee.bankDetails.accountNumber || '-', 'Payment Date', payslip.paymentDate ? new Date(`${payslip.paymentDate}T00:00:00`).toLocaleDateString('en-IN') : '-'],
  ]);

  section('ATTENDANCE SUMMARY');
  detailsGrid([
    ['Working Days', String(payslip.workingDays), 'Present Days', String(payslip.presentDays)],
    ['Paid Leave Days', String(payslip.paidLeaveDays), 'Unpaid Days', String(payslip.unpaidDays)],
  ]);

  section('SALARY COMPUTATION');
  const tableTop = y;
  doc.setFillColor(...navy); doc.rect(margin, tableTop, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('EARNINGS', margin + 3, tableTop + 5.2); doc.text('AMOUNT', margin + 87, tableTop + 5.2, { align: 'right' });
  doc.text('DEDUCTIONS', margin + 95, tableTop + 5.2); doc.text('AMOUNT', pageWidth - margin - 3, tableTop + 5.2, { align: 'right' });
  const earnings: Array<[string, number]> = [['Basic Salary', payslip.basicSalary], ['House Rent Allowance (HRA)', payslip.hra], ['Special / Other Allowances', payslip.allowances], ['Gross Earnings', payslip.grossSalary]];
  const deductions: Array<[string, number]> = [['Provident Fund (EPF)', payslip.providentFund], ['TDS / Income Tax', payslip.taxDeductions], ['Other Deductions', payslip.otherDeductions], ['Total Deductions', payslip.totalDeductions]];
  y = tableTop + 8;
  earnings.forEach((item, index) => {
    if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(margin, y, contentWidth, 8, 'F'); }
    doc.setTextColor(...navy); doc.setFont('helvetica', index === 3 ? 'bold' : 'normal'); doc.setFontSize(8);
    doc.text(item[0], margin + 3, y + 5.2); doc.text(money(item[1]), margin + 87, y + 5.2, { align: 'right' });
    doc.text(deductions[index][0], margin + 95, y + 5.2); doc.text(money(deductions[index][1]), pageWidth - margin - 3, y + 5.2, { align: 'right' });
    y += 8;
  });
  doc.setDrawColor(...line); doc.rect(margin, tableTop, contentWidth, 40);
  doc.line(margin + 91, tableTop, margin + 91, tableTop + 40);
  y += 5;

  doc.setFillColor(236, 253, 245); doc.setDrawColor(110, 231, 183); doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
  doc.setTextColor(...green); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('NET PAYABLE', margin + 4, y + 7);
  doc.setFontSize(15); doc.text(money(payslip.netSalary), pageWidth - margin - 4, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(`${numberToWords(payslip.netSalary)} Rupees Only`, margin + 4, y + 13);
  y += 25;

  doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('Payment Mode: NEFT / IMPS / Bank Transfer', margin, y);
  doc.text(`Generated: ${generatedOn}`, pageWidth - margin, y, { align: 'right' });
  y += 7;
  doc.setDrawColor(...line); doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.text('This is a computer-generated salary statement and does not require a physical signature.', margin, y);
  doc.text('For payroll queries, contact the company HR / Accounts department.', margin, y + 4);
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold');
  doc.text('Authorized by', pageWidth - margin, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.text(settings.legalEntityName || company.name, pageWidth - margin, y + 4, { align: 'right' });

  doc.setFillColor(...blue); doc.rect(0, 292, pageWidth, 5, 'F');
  doc.save(`${employee.employeeCode}_${employee.firstName}_${employee.lastName}_Payslip_${payslip.month}.pdf`);
}
