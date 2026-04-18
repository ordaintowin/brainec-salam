import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function deployProcess() {
  try {
    console.log('📊 Starting deployment process...');
    
    // 1. Run migrations
    console.log('🔄 Running Prisma migrations...');
    await execAsync('npx prisma migrate deploy');
    
    // 2. Seed fresh data (optional)
    console.log('🌱 Seeding database...');
    await execAsync('npx prisma db seed');
    
    console.log('✅ Deployment complete!');
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

deployProcess();