// Replace the top lines with this import
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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
    // Never overwrite an existing user's name, password, role, or status
    // when the application starts or migrations are deployed.
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@bs.com',
      password: await bcrypt.hash('admin', 10),
      role: 'ADMIN',
    },
  });
  console.log('✅ Admin user ensured without overwriting existing credentials');
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => { console.error('❌ Seed Error:', e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
