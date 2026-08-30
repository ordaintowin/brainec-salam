import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  });

  // Local development and the Replit workflow run Nest as a normal HTTP
  // service. Vercel still uses the exported handler below.
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const port = Number(process.env.PORT || 5001);
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on port ${port}`);
  } else {
    await app.init();
  }
  return app;
}

if (!process.env.VERCEL) {
  bootstrap().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

// Handler for Vercel Serverless environment
export default async (req: any, res: any) => {
  const app = await bootstrap();
  const instance = app.getHttpAdapter().getInstance();
  return instance(req, res);
};
