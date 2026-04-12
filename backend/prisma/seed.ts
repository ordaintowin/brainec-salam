import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ----- Classes -----
  const classNames = ['KG1', 'KG2', 'Nursery1', 'Nursery2', 'Primary1'];
  const classes: Record<string, any> = {};

  for (const name of classNames) {
    const cls = await prisma.class.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} Class` },
    });
    classes[name] = cls;
    console.log(`✅ Class: ${name}`);
  }

  // ----- Headmistress -----
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
  console.log('✅ Headmistress user created');

  // ----- Teachers -----
  const teacherData = [
    {
      name: 'Mr. Kwame Asante',
      email: 'kwame.asante@brainec-salam.edu.gh',
      employeeId: 'BST-001',
      classKey: 'KG1',
      phone: '0244123456',
      qualification: 'B.Ed. Basic Education',
      joinDate: new Date('2020-09-01'),
    },
    {
      name: 'Mrs. Abena Mensah',
      email: 'abena.mensah@brainec-salam.edu.gh',
      employeeId: 'BST-002',
      classKey: 'KG2',
      phone: '0277654321',
      qualification: 'Diploma in Early Childhood Education',
      joinDate: new Date('2021-01-15'),
    },
  ];

  const teacherPassword = await bcrypt.hash('Teacher@1234', 10);

  for (const t of teacherData) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        name: t.name,
        email: t.email,
        password: teacherPassword,
        role: 'TEACHER',
      },
    });

    await prisma.teacher.upsert({
      where: { employeeId: t.employeeId },
      update: {},
      create: {
        userId: user.id,
        employeeId: t.employeeId,
        classId: classes[t.classKey].id,
        phone: t.phone,
        qualification: t.qualification,
        joinDate: t.joinDate,
      },
    });
    console.log(`✅ Teacher: ${t.name}`);
  }

  // ----- Students -----
  const studentSeed: Array<{
    firstName: string;
    lastName: string;
    gender: string;
    dateOfBirth: Date;
    guardianName: string;
    guardianPhone: string;
    classKey: string;
  }> = [
    // KG1
    { firstName: 'Kofi', lastName: 'Boateng', gender: 'Male', dateOfBirth: new Date('2019-03-12'), guardianName: 'Emmanuel Boateng', guardianPhone: '0201112233', classKey: 'KG1' },
    { firstName: 'Ama', lastName: 'Owusu', gender: 'Female', dateOfBirth: new Date('2019-07-04'), guardianName: 'Grace Owusu', guardianPhone: '0202223344', classKey: 'KG1' },
    { firstName: 'Yaw', lastName: 'Darko', gender: 'Male', dateOfBirth: new Date('2019-11-22'), guardianName: 'Patrick Darko', guardianPhone: '0203334455', classKey: 'KG1' },
    // KG2
    { firstName: 'Akua', lastName: 'Asare', gender: 'Female', dateOfBirth: new Date('2018-05-18'), guardianName: 'Beatrice Asare', guardianPhone: '0244556677', classKey: 'KG2' },
    { firstName: 'Kweku', lastName: 'Adjei', gender: 'Male', dateOfBirth: new Date('2018-09-30'), guardianName: 'Samuel Adjei', guardianPhone: '0245667788', classKey: 'KG2' },
    { firstName: 'Efua', lastName: 'Tetteh', gender: 'Female', dateOfBirth: new Date('2018-01-14'), guardianName: 'Comfort Tetteh', guardianPhone: '0246778899', classKey: 'KG2' },
    // Nursery1
    { firstName: 'Nana', lastName: 'Appiah', gender: 'Male', dateOfBirth: new Date('2020-04-07'), guardianName: 'Richard Appiah', guardianPhone: '0277889900', classKey: 'Nursery1' },
    { firstName: 'Adwoa', lastName: 'Frimpong', gender: 'Female', dateOfBirth: new Date('2020-08-19'), guardianName: 'Janet Frimpong', guardianPhone: '0278990011', classKey: 'Nursery1' },
    { firstName: 'Kwabena', lastName: 'Acheampong', gender: 'Male', dateOfBirth: new Date('2020-12-03'), guardianName: 'Isaac Acheampong', guardianPhone: '0279001122', classKey: 'Nursery1' },
    // Nursery2
    { firstName: 'Abena', lastName: 'Amoah', gender: 'Female', dateOfBirth: new Date('2019-02-25'), guardianName: 'Felicia Amoah', guardianPhone: '0500112233', classKey: 'Nursery2' },
    { firstName: 'Kwame', lastName: 'Osei', gender: 'Male', dateOfBirth: new Date('2019-06-10'), guardianName: 'Felix Osei', guardianPhone: '0501223344', classKey: 'Nursery2' },
    { firstName: 'Akosua', lastName: 'Bonsu', gender: 'Female', dateOfBirth: new Date('2019-10-17'), guardianName: 'Doris Bonsu', guardianPhone: '0502334455', classKey: 'Nursery2' },
    // Primary1
    { firstName: 'Fiifi', lastName: 'Quaye', gender: 'Male', dateOfBirth: new Date('2017-03-28'), guardianName: 'Anthony Quaye', guardianPhone: '0541445566', classKey: 'Primary1' },
    { firstName: 'Maame', lastName: 'Kyei', gender: 'Female', dateOfBirth: new Date('2017-07-09'), guardianName: 'Victoria Kyei', guardianPhone: '0542556677', classKey: 'Primary1' },
    { firstName: 'Kofi', lastName: 'Kusi', gender: 'Male', dateOfBirth: new Date('2017-11-01'), guardianName: 'George Kusi', guardianPhone: '0543667788', classKey: 'Primary1' },
  ];

  const year = new Date().getFullYear();
  let counter = 1;

  for (const s of studentSeed) {
    const studentId = `BS-${year}-${String(counter).padStart(3, '0')}`;
    const existing = await prisma.student.findUnique({ where: { studentId } });
    if (!existing) {
      await prisma.student.create({
        data: {
          studentId,
          firstName: s.firstName,
          lastName: s.lastName,
          gender: s.gender,
          dateOfBirth: s.dateOfBirth,
          classId: classes[s.classKey].id,
          guardianName: s.guardianName,
          guardianPhone: s.guardianPhone,
        },
      });
      console.log(`✅ Student: ${s.firstName} ${s.lastName} (${studentId})`);
    }
    counter++;
  }

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
