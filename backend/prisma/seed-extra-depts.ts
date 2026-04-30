import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const newDepts = [
  { departmentCode: 'ROBINSON', departmentName: 'Robinson', departmentType: 'DEPARTMENT_STORE' as const },
  { departmentCode: 'FASHION', departmentName: 'Fashion', departmentType: 'SHOPPING_MALL' as const },
  { departmentCode: 'MEGA', departmentName: 'Mega', departmentType: 'SHOPPING_MALL' as const },
  { departmentCode: 'SEACON', departmentName: 'Seacon', departmentType: 'SHOPPING_MALL' as const },
  { departmentCode: 'TERMINAL_21', departmentName: 'Terminal 21', departmentType: 'SHOPPING_MALL' as const },
  { departmentCode: 'IT_MALL', departmentName: 'IT Mall', departmentType: 'SPECIALTY_STORE' as const },
  { departmentCode: 'ZEER', departmentName: 'Zeer', departmentType: 'SHOPPING_MALL' as const },
  { departmentCode: 'PASSIONE', departmentName: 'Passione', departmentType: 'SHOPPING_MALL' as const },
  { departmentCode: 'MAYA', departmentName: 'Maya', departmentType: 'SHOPPING_MALL' as const },
  { departmentCode: 'HAPPITAT', departmentName: 'HAPPITAT', departmentType: 'OTHER' as const },
  { departmentCode: 'CLOUD_11', departmentName: 'CLOUD 11', departmentType: 'OTHER' as const },
];

async function main() {
  for (const d of newDepts) {
    await prisma.department.upsert({
      where: { departmentCode: d.departmentCode },
      update: {},
      create: d,
    });
    console.log(`  + ${d.departmentName}`);
  }
  console.log('Done. Total departments now seeded.');
  const all = await prisma.department.findMany({ orderBy: { departmentCode: 'asc' } });
  console.log(`Departments in DB: ${all.length}`);
  all.forEach(d => console.log(`  ${d.departmentCode.padEnd(20)} ${d.departmentName}`));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
