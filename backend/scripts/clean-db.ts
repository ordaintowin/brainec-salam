import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDatabase() {
  try {
    // Delete in order of foreign key dependencies
    await prisma.activityLog.deleteMany({});
    await prisma.attendance.deleteMany({});
    await prisma.fee.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.teacher.deleteMany({});
    await prisma.classRoom.deleteMany({});
    await prisma.user.deleteMany({});
    
    console.log('✅ Database cleaned successfully');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanDatabase();