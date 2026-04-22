import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    // We use the DIRECT URL here so Prisma CLI commands 
    // never get stuck in the teacher connection pool.
    url: env('DIRECT_DATABASE_URL'), 
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
