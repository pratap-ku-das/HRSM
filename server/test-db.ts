import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { normalizeDatabaseUrl } from './databaseUrl.js';

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);

async function check() {
  console.log('Connecting to PostgreSQL...');
  await prisma.$queryRaw`SELECT 1`;
  const companies = await prisma.company.count();
  const users = await prisma.user.count();
  const employees = await prisma.employee.count();
  const attendance = await prisma.attendanceRecord.count();

  console.log('PostgreSQL connected successfully.');
  console.log('Live database counts:', { companies, users, employees, attendance });
}

check()
  .catch((error) => {
    console.error('PostgreSQL connection test failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
