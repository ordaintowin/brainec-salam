// Replace the top lines with this import
import prisma from '../lib/prisma'; // Adjust path if your lib is elsewhere
import * as bcrypt from 'bcrypt';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';

// REMOVE: const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');
  const classNames = ['Lilly/Infant', 'Pre-Nursery', 'Nursery 1', 'Nursery 2', 'KG 1', 'KG 2', 'Grade 1'];
  const classes: Record<string, any> = {};

  for (const name of classNames) {
    const cls = await prisma.class.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} Class` },
    });
    classes[name] = cls;
  }
  console.log('✅ Classes initialized');

  const headPassword = await bcrypt.hash('Admin@1234', 10);
  await prisma.user.upsert({
    where: { email: 'headmistress@brainec-salam.edu.gh' },
    update: {},
    create: {
      name: 'Mrs. Headmistress',
      email: 'headmistress@brainec-salam.edu.gh',
      password: headPassword,
      role: 'HEADMISTRESS',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@bs.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@bs.com',
      password: '$2a$12$p2vcswaPU.RUYvyNA65xT.wCfLtd8UppVvwDhc.dQzuyTF83MjTP2',
      role: 'ADMIN',
    },
  });
  console.log('✅ Admin user restored');

  await prisma.student.deleteMany({});
  console.log('🗑️ Cleared old student records');

  const students: any[] = [];
  const year = new Date().getFullYear();
  let counter = 1;
  const csvFilePath = path.join(__dirname, 'br.csv');

  await new Promise((resolve, reject) => {
    if (!fs.existsSync(csvFilePath)) return reject(new Error(`File not found at ${csvFilePath}`));
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        const classNameFromCSV = row.classId?.trim();
        const targetClass = classes[classNameFromCSV];
        students.push({
          studentId: `BAC-${year}-${String(counter++).padStart(3, '0')}`,
          firstName: row.firstName,
          lastName: row.lastName,
          classId: targetClass ? targetClass.id : classes['Grade 1'].id,
          guardianPhone: row.guardianPhone,
          secondaryGuardianPhone: row.secondaryGuardianPhone || null,
          gender: 'MALE',
          dateOfBirth: new Date('2015-01-01'),
          guardianName: 'Default Guardian',
        });
      })
      .on('end', resolve)
      .on('error', reject);
  });

  await prisma.student.createMany({ data: students, skipDuplicates: true });
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => { console.error('❌ Seed Error:', e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
