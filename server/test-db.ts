import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  console.log('Connecting to Supabase PostgreSQL...');
  const companies = await prisma.company.count();
  const users = await prisma.user.count();
  const employees = await prisma.employee.count();
  const attendance = await prisma.attendanceRecord.count();
  
  console.log('✅ Supabase PostgreSQL Connected Successfully!');
  console.log('Live Database Counts:', {
    companies,
    users,
    employees,
    attendance,
  });
}

check()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
