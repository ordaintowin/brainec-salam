// frontend/prisma.config.ts
import { defineConfig } from 'prisma/config';
import 'dotenv/config'; // This loads the .env file

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    // Use process.env directly to ensure it pulls from your system/file
    url: process.env.DATABASE_URL, 
  },
});
