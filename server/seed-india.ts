import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedIndianData() {
  console.log('🇮🇳 Seeding 100% Indian Enterprise HRMS data into Supabase PostgreSQL...');

  // 1. Create Indian Company
  const company = await prisma.company.upsert({
    where: { slug: 'apex-bharat' },
    update: {
      name: 'Apex Bharat Technologies Pvt. Ltd.',
      email: 'hr@apexbharat.in',
      phone: '+91 80 4928 5500',
      address: 'Prestige Tech Park, Outer Ring Road, Marathahalli, Bengaluru, Karnataka 560103',
      industry: 'Information Technology & Software Services',
      size: '51-200 employees',
      plan: 'ENTERPRISE',
    },
    create: {
      name: 'Apex Bharat Technologies Pvt. Ltd.',
      slug: 'apex-bharat',
      email: 'hr@apexbharat.in',
      phone: '+91 80 4928 5500',
      address: 'Prestige Tech Park, Outer Ring Road, Marathahalli, Bengaluru, Karnataka 560103',
      industry: 'Information Technology & Software Services',
      size: '51-200 employees',
      plan: 'ENTERPRISE',
    },
  });

  console.log('✅ Company Seeded:', company.name);

  // 2. Seed Indian Company Settings
  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {
      companyName: 'Apex Bharat Technologies Pvt. Ltd.',
      legalEntityName: 'Apex Bharat Technologies Private Limited',
      taxRegistrationNumber: 'GSTIN: 29AABCA1234F1Z8 | PAN: AABCA1234F',
      currency: 'INR',
      currencySymbol: '₹',
      timezone: 'Asia/Kolkata (IST - UTC+5:30)',
      workDays: [1, 2, 3, 4, 5],
      businessHoursStart: '09:30',
      businessHoursEnd: '18:30',
      enableAutomaticOvertime: true,
      enableAuditLogging: true,
      defaultProbationPeriodMonths: 3,
    },
    create: {
      companyId: company.id,
      companyName: 'Apex Bharat Technologies Pvt. Ltd.',
      legalEntityName: 'Apex Bharat Technologies Private Limited',
      taxRegistrationNumber: 'GSTIN: 29AABCA1234F1Z8 | PAN: AABCA1234F',
      currency: 'INR',
      currencySymbol: '₹',
      timezone: 'Asia/Kolkata (IST - UTC+5:30)',
      workDays: [1, 2, 3, 4, 5],
      businessHoursStart: '09:30',
      businessHoursEnd: '18:30',
      enableAutomaticOvertime: true,
      enableAuditLogging: true,
      defaultProbationPeriodMonths: 3,
    },
  });

  // 3. Seed Indian Departments
  const deptData = [
    { name: 'Executive & Leadership', code: 'EXEC', budget: 5000000, location: 'Tower A, Floor 5, Bengaluru' },
    { name: 'Engineering & Technology', code: 'ENG', budget: 15000000, location: 'Tower A, Floor 4, Bengaluru' },
    { name: 'Product & UX Design', code: 'PROD', budget: 4500000, location: 'Tower A, Floor 3, Bengaluru' },
    { name: 'People Operations & HR', code: 'HR', budget: 3000000, location: 'Tower B, Floor 2, Bengaluru' },
    { name: 'Finance & Compliance', code: 'FIN', budget: 3500000, location: 'Tower B, Floor 2, Bengaluru' },
    { name: 'Sales & Growth', code: 'SALES', budget: 6000000, location: 'Cyber City, Gurugram Hub' },
  ];

  const depts: any[] = [];
  for (const d of deptData) {
    const existing = await prisma.department.findFirst({
      where: { companyId: company.id, code: d.code },
    });
    if (existing) {
      depts.push(existing);
    } else {
      const created = await prisma.department.create({
        data: {
          companyId: company.id,
          name: d.name,
          code: d.code,
          budget: d.budget,
          location: d.location,
          description: `${d.name} operations and team management.`,
        },
      });
      depts.push(created);
    }
  }

  // 4. Seed Indian Designations
  const desigData = [
    { title: 'Chief Executive Officer', gradeLevel: 'L8', departmentId: depts[0].id },
    { title: 'VP of Human Resources', gradeLevel: 'L7', departmentId: depts[3].id },
    { title: 'Principal Software Architect', gradeLevel: 'L6', departmentId: depts[1].id },
    { title: 'Lead Product Designer', gradeLevel: 'L5', departmentId: depts[2].id },
    { title: 'Senior DevOps Engineer', gradeLevel: 'L4', departmentId: depts[1].id },
    { title: 'Senior Full-Stack Engineer', gradeLevel: 'L4', departmentId: depts[1].id },
    { title: 'Human Resource Specialist', gradeLevel: 'L3', departmentId: depts[3].id },
    { title: 'Finance & Payroll Executive', gradeLevel: 'L3', departmentId: depts[4].id },
  ];

  const designations: any[] = [];
  for (const des of desigData) {
    const existing = await prisma.designation.findFirst({
      where: { companyId: company.id, title: des.title },
    });
    if (existing) {
      designations.push(existing);
    } else {
      const created = await prisma.designation.create({
        data: {
          companyId: company.id,
          title: des.title,
          gradeLevel: des.gradeLevel,
          departmentId: des.departmentId,
        },
      });
      designations.push(created);
    }
  }

  // 5. Seed Indian Users
  const usersData = [
    {
      email: 'admin@apexbharat.in',
      fullName: 'Rajesh Sharma',
      role: 'SUPER_ADMIN' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    },
    {
      email: 'hr@apexbharat.in',
      fullName: 'Priya Patel',
      role: 'HR_MANAGER' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    },
    {
      email: 'aarav.verma@apexbharat.in',
      fullName: 'Aarav Verma',
      role: 'EMPLOYEE' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    },
    {
      email: 'ananya.iyer@apexbharat.in',
      fullName: 'Ananya Iyer',
      role: 'EMPLOYEE' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    },
    {
      email: 'vikram.singh@apexbharat.in',
      fullName: 'Vikramaditya Singh',
      role: 'DEPT_HEAD' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        companyId: company.id,
        fullName: u.fullName,
        role: u.role,
        avatarUrl: u.avatarUrl,
      },
      create: {
        companyId: company.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        avatarUrl: u.avatarUrl,
      },
    });
  }

  // 6. Seed Indian Employees
  const employeeData = [
    {
      employeeCode: 'IND-1001',
      firstName: 'Rajesh',
      lastName: 'Sharma',
      email: 'admin@apexbharat.in',
      phone: '+91 98801 23456',
      departmentId: depts[0].id,
      designationId: designations[0].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2022-01-15'),
      basicSalary: 250000,
      hra: 100000,
      allowances: 50000,
      providentFund: 30000,
      taxDeduction: 45000,
      currency: 'INR',
      gender: 'MALE',
      workLocation: 'Bengaluru (HQ)',
    },
    {
      employeeCode: 'IND-1002',
      firstName: 'Priya',
      lastName: 'Patel',
      email: 'hr@apexbharat.in',
      phone: '+91 98802 34567',
      departmentId: depts[3].id,
      designationId: designations[1].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2022-03-01'),
      basicSalary: 150000,
      hra: 60000,
      allowances: 30000,
      providentFund: 18000,
      taxDeduction: 25000,
      currency: 'INR',
      gender: 'FEMALE',
      workLocation: 'Bengaluru (HQ)',
    },
    {
      employeeCode: 'IND-1003',
      firstName: 'Aarav',
      lastName: 'Verma',
      email: 'aarav.verma@apexbharat.in',
      phone: '+91 98803 45678',
      departmentId: depts[1].id,
      designationId: designations[2].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2022-06-10'),
      basicSalary: 180000,
      hra: 72000,
      allowances: 35000,
      providentFund: 21600,
      taxDeduction: 32000,
      currency: 'INR',
      gender: 'MALE',
      workLocation: 'Bengaluru (HQ)',
    },
    {
      employeeCode: 'IND-1004',
      firstName: 'Ananya',
      lastName: 'Iyer',
      email: 'ananya.iyer@apexbharat.in',
      phone: '+91 98804 56789',
      departmentId: depts[2].id,
      designationId: designations[3].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2023-01-20'),
      basicSalary: 120000,
      hra: 48000,
      allowances: 25000,
      providentFund: 14400,
      taxDeduction: 18000,
      currency: 'INR',
      gender: 'FEMALE',
      workLocation: 'Bengaluru (HQ)',
    },
    {
      employeeCode: 'IND-1005',
      firstName: 'Vikramaditya',
      lastName: 'Singh',
      email: 'vikram.singh@apexbharat.in',
      phone: '+91 98805 67890',
      departmentId: depts[1].id,
      designationId: designations[4].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2023-04-15'),
      basicSalary: 130000,
      hra: 52000,
      allowances: 28000,
      providentFund: 15600,
      taxDeduction: 20000,
      currency: 'INR',
      gender: 'MALE',
      workLocation: 'Hyderabad Hub',
    },
    {
      employeeCode: 'IND-1006',
      firstName: 'Sneha',
      lastName: 'Reddy',
      email: 'sneha.reddy@apexbharat.in',
      phone: '+91 98806 78901',
      departmentId: depts[3].id,
      designationId: designations[6].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2023-08-01'),
      basicSalary: 80000,
      hra: 32000,
      allowances: 18000,
      providentFund: 9600,
      taxDeduction: 10000,
      currency: 'INR',
      gender: 'FEMALE',
      workLocation: 'Bengaluru (HQ)',
    },
    {
      employeeCode: 'IND-1007',
      firstName: 'Rohan',
      lastName: 'Gupta',
      email: 'rohan.gupta@apexbharat.in',
      phone: '+91 98807 89012',
      departmentId: depts[1].id,
      designationId: designations[5].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2023-11-15'),
      basicSalary: 95000,
      hra: 38000,
      allowances: 20000,
      providentFund: 11400,
      taxDeduction: 12000,
      currency: 'INR',
      gender: 'MALE',
      workLocation: 'Pune Hub',
    },
    {
      employeeCode: 'IND-1008',
      firstName: 'Pooja',
      lastName: 'Nair',
      email: 'pooja.nair@apexbharat.in',
      phone: '+91 98808 90123',
      departmentId: depts[4].id,
      designationId: designations[7].id,
      employmentType: 'FULL_TIME' as const,
      status: 'ACTIVE' as const,
      dateOfJoining: new Date('2024-02-01'),
      basicSalary: 75000,
      hra: 30000,
      allowances: 15000,
      providentFund: 9000,
      taxDeduction: 8000,
      currency: 'INR',
      gender: 'FEMALE',
      workLocation: 'Bengaluru (HQ)',
    },
  ];

  const seededEmployees: any[] = [];
  for (const emp of employeeData) {
    const existing = await prisma.employee.findFirst({
      where: { companyId: company.id, employeeCode: emp.employeeCode },
    });

    if (existing) {
      seededEmployees.push(existing);
    } else {
      const created = await prisma.employee.create({
        data: {
          companyId: company.id,
          employeeCode: emp.employeeCode,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          phone: emp.phone,
          departmentId: emp.departmentId,
          designationId: emp.designationId,
          employmentType: emp.employmentType,
          status: emp.status,
          dateOfJoining: emp.dateOfJoining,
          basicSalary: emp.basicSalary,
          hra: emp.hra,
          allowances: emp.allowances,
          providentFund: emp.providentFund,
          taxDeduction: emp.taxDeduction,
          currency: emp.currency,
          gender: emp.gender,
          workLocation: emp.workLocation,
        },
      });
      seededEmployees.push(created);
    }
  }

  // 7. Seed Indian Leave Types
  const indianLeaveTypes = [
    { name: 'Privilege Leave (PL/EL)', code: 'PL', daysAllowedPerYear: 18, isPaid: true, color: '#3b82f6' },
    { name: 'Casual Leave (CL)', code: 'CL', daysAllowedPerYear: 12, isPaid: true, color: '#10b981' },
    { name: 'Sick & Medical Leave (SL)', code: 'SL', daysAllowedPerYear: 10, isPaid: true, color: '#ef4444' },
    { name: 'Maternity Leave (ML)', code: 'ML', daysAllowedPerYear: 182, isPaid: true, color: '#ec4899' },
    { name: 'Paternity Leave', code: 'PTL', daysAllowedPerYear: 15, isPaid: true, color: '#8b5cf6' },
  ];

  for (const lt of indianLeaveTypes) {
    const existing = await prisma.leaveType.findFirst({
      where: { companyId: company.id, code: lt.code },
    });
    if (!existing) {
      await prisma.leaveType.create({
        data: {
          companyId: company.id,
          name: lt.name,
          code: lt.code,
          daysAllowedPerYear: lt.daysAllowedPerYear,
          isPaid: lt.isPaid,
          color: lt.color,
        },
      });
    }
  }

  // 8. Seed Indian Public & Gazetted Holidays 2026
  const indianHolidays = [
    { name: 'Republic Day', date: '2026-01-26', type: 'GAZETTED' },
    { name: 'Maha Shivratri', date: '2026-02-15', type: 'RESTRICTED' },
    { name: 'Holi (Festival of Colours)', date: '2026-03-04', type: 'GAZETTED' },
    { name: 'Ugadi / Gudi Padwa', date: '2026-03-20', type: 'OPTIONAL' },
    { name: 'Eid-ul-Fitr (Ramzan Eid)', date: '2026-03-21', type: 'GAZETTED' },
    { name: 'Independence Day', date: '2026-08-15', type: 'NATIONAL' },
    { name: 'Ganesh Chaturthi', date: '2026-09-14', type: 'GAZETTED' },
    { name: 'Mahatma Gandhi Jayanti', date: '2026-10-02', type: 'NATIONAL' },
    { name: 'Dussehra (Vijayadashami)', date: '2026-10-20', type: 'GAZETTED' },
    { name: 'Diwali (Deepavali & Laxmi Pujan)', date: '2026-11-08', type: 'GAZETTED' },
    { name: 'Guru Nanak Jayanti', date: '2026-11-24', type: 'GAZETTED' },
    { name: 'Christmas Day', date: '2026-12-25', type: 'GAZETTED' },
  ];

  for (const h of indianHolidays) {
    const existing = await prisma.holiday.findFirst({
      where: { companyId: company.id, date: new Date(h.date) },
    });
    if (!existing) {
      await prisma.holiday.create({
        data: {
          companyId: company.id,
          name: h.name,
          date: new Date(h.date),
          type: h.type,
        },
      });
    }
  }

  // 9. Seed Indian Announcements
  const indianAnnouncements = [
    {
      title: '🎉 Diwali Bonus & Special Corporate Holidays Declared',
      content: 'Apex Bharat is pleased to announce a festival bonus credited with October payroll and mandatory office closure on Nov 8 & 9 for Deepavali celebrations.',
      priority: 'HIGH',
      authorName: 'Priya Patel',
      authorRole: 'HR Director',
    },
    {
      title: '📋 Annual IT Tax Declaration & Form 16 Window Open',
      content: 'All employees are requested to submit investment proofs (80C, 80D, HRA receipts) on the portal before Jan 31 for TDS tax optimization.',
      priority: 'MEDIUM',
      authorName: 'Pooja Nair',
      authorRole: 'Finance Specialist',
    },
  ];

  for (const a of indianAnnouncements) {
    await prisma.announcement.create({
      data: {
        companyId: company.id,
        title: a.title,
        content: a.content,
        priority: a.priority,
        authorName: a.authorName,
        authorRole: a.authorRole,
      },
    });
  }

  // 10. Seed Attendance for today (August 20, 2026)
  const todayStr = '2026-08-20';
  for (let i = 0; i < seededEmployees.length; i++) {
    const emp = seededEmployees[i];
    const isPresent = i !== 2; // Aarav is on approved leave
    await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: emp.id,
          date: new Date(todayStr),
        },
      },
      update: {
        companyId: company.id,
        status: isPresent ? (i === 1 ? 'LATE' : 'PRESENT') : 'LEAVE',
        faceAuthVerified: isPresent,
        source: 'MOBILE_FACE',
      },
      create: {
        companyId: company.id,
        employeeId: emp.id,
        date: new Date(todayStr),
        status: isPresent ? (i === 1 ? 'LATE' : 'PRESENT') : 'LEAVE',
        faceAuthVerified: isPresent,
        source: 'MOBILE_FACE',
      },
    });
  }

  console.log('🇮🇳 Successfully completed 100% Indian Enterprise seed in Supabase PostgreSQL!');
}

seedIndianData()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
