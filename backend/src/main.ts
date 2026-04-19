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
    // Important: Ensure this URL in Vercel settings has NO trailing slash
    origin: process.env.FRONTEND_URL || 'https://brainec-salam.vercel.app',
    credentials: true,
  });

  // Local development logic
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  }

  await app.init(); // Initialize the app but don't call listen() for Vercel
  return app;
}

// Handler for Vercel Serverless environment
export default async (req: any, res: any) => {
  const app = await bootstrap();
  const instance = app.getHttpAdapter().getInstance();
  return instance(req, res);
};
