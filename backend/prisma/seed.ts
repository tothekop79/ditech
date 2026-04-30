import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');

  // Users
  const adminPass = await bcrypt.hash('Admin123!', 10);
  const pmPass = await bcrypt.hash('Pm123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ditech.co.th' },
    update: {},
    create: { email: 'admin@ditech.co.th', password: adminPass, fullName: 'Admin User', role: 'ADMIN' },
  });

  const pm = await prisma.user.upsert({
    where: { email: 'pm@ditech.co.th' },
    update: {},
    create: { email: 'pm@ditech.co.th', password: pmPass, fullName: 'Project Manager', role: 'PROJECT_MANAGER' },
  });

  // Customers
  await prisma.customer.createMany({
    data: [
      { customerCode: 'XIAOMI', customerName: 'Xiaomi Thailand' },
      { customerCode: 'OPPO', customerName: 'OPPO Thailand' },
      { customerCode: 'RBSC', customerName: 'RBSC' },
    ],
    skipDuplicates: true,
  });

  // Departments
  await prisma.department.createMany({
    data: [
      { departmentCode: 'CENTRAL', departmentName: 'Central', departmentType: 'DEPARTMENT_STORE' },
      { departmentCode: 'THE_MALL', departmentName: 'The Mall', departmentType: 'DEPARTMENT_STORE' },
      { departmentCode: 'HOMEPRO', departmentName: 'Homepro', departmentType: 'SPECIALTY_STORE' },
      { departmentCode: 'FUTURE_PARK', departmentName: 'Future Park', departmentType: 'SHOPPING_MALL' },
      { departmentCode: 'LOTUS', departmentName: 'Lotus', departmentType: 'HYPERMARKET' },
      { departmentCode: 'BIG_C', departmentName: 'BIG C', departmentType: 'HYPERMARKET' },
      { departmentCode: 'AYUTTHAYA', departmentName: 'Ayutthaya City Park', departmentType: 'SHOPPING_MALL' },
    ],
    skipDuplicates: true,
  });

  // Teams
  await prisma.team.createMany({
    data: [
      { name: 'Team A', region: 'BANGKOK', dailyCap: 2 },
      { name: 'Team B', region: 'BANGKOK', dailyCap: 2 },
      { name: 'Team C', region: 'UPC', dailyCap: 1 },
      { name: 'Team D', region: 'UPC', dailyCap: 1 },
    ],
    skipDuplicates: true,
  });

  // Notification rules (8 defaults from prototype)
  const rules = [
    { name: 'Daily morning brief', enabled: true, trigger: 'DAILY_AT' as const, triggerTime: '07:00',
      recipients: ['Team A', 'Team B', 'Team C', 'Team D'],
      description: 'ส่งงานของวันให้ทีมหน้างานทุกเช้า' },
    { name: 'Evening day-before brief', enabled: true, trigger: 'EVENING_DAY_BEFORE' as const, triggerTime: '18:00',
      recipients: ['Team A', 'Team B', 'Team C', 'Team D'],
      description: 'ส่งงานของพรุ่งนี้ให้ทีมเตรียมตัว' },
    { name: 'Plan confirmed', enabled: true, trigger: 'STATUS_CHANGE' as const, triggerCondition: 'CONFIRMED',
      recipients: ['PM Group', 'Assigned team'],
      description: 'แจ้งเมื่อ plan ถูก confirm + branch สร้าง' },
    { name: 'Readiness flipped to ready', enabled: true, trigger: 'READINESS_READY' as const,
      recipients: ['PM Group'],
      description: 'แจ้งเมื่อสาขา not-ready กลับเป็น ready' },
    { name: 'Not-ready warning (3 days out)', enabled: true, trigger: 'NOT_READY_NEAR' as const, daysAhead: 3,
      recipients: ['PM Group'],
      description: 'เตือนเมื่อสาขายัง not-ready แต่ใกล้ถึงวันติดตั้ง' },
    { name: 'Capacity overflow alert', enabled: false, trigger: 'CAPACITY_OVERFLOW' as const,
      recipients: ['PM Group', 'Admin'],
      description: 'แจ้งเมื่อจำนวนงานเกิน capacity ของทีมในวันนั้น' },
    { name: 'Installation completed', enabled: true, trigger: 'STATUS_CHANGE' as const, triggerCondition: 'COMPLETED',
      recipients: ['PM Group', 'Customer Group'],
      description: 'แจ้งเมื่อติดตั้งเสร็จ พร้อมลิงก์ handover doc' },
    { name: 'Weekly report (Monday 9am)', enabled: true, trigger: 'WEEKLY_AT' as const, triggerTime: '09:00', triggerDay: 'Monday',
      recipients: ['PM Group', 'Admin', 'Customer Group'],
      description: 'ส่ง weekly summary report ให้ทุกฝ่าย' },
  ];

  for (const r of rules) {
    const existing = await prisma.notificationRule.findFirst({ where: { name: r.name } });
    if (!existing) await prisma.notificationRule.create({ data: r });
  }

  // Sample plans
  const xiaomi = await prisma.customer.findUnique({ where: { customerCode: 'XIAOMI' } });
  const central = await prisma.department.findUnique({ where: { departmentCode: 'CENTRAL' } });
  const teamA = await prisma.team.findUnique({ where: { name: 'Team A' } });

  if (xiaomi && central && teamA) {
    const existing = await prisma.installationPlan.findFirst({ where: { storeName: 'Central Charngwattana' } });
    if (!existing) {
      await prisma.installationPlan.create({
        data: {
          customerId: xiaomi.id,
          departmentId: central.id,
          storeName: 'Central Charngwattana',
          storeRegion: 'BANGKOK',
          province: 'Bangkok',
          description: 'install Cam + Lan',
          sensorCount: 2,
          readiness: 'READY',
          detail: 'Confirm',
          scheduledDate: new Date('2026-04-25'),
          teamId: teamA.id,
          createdById: admin.id,
        },
      });
    }
  }

  console.log('Seed complete.');
  console.log('Login as: admin@ditech.co.th / Admin123!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
