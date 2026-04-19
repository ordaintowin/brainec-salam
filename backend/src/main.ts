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
    // Use the ENV variable, but ensure it's exact (no trailing slash)
    origin: process.env.FRONTEND_URL || 'https://brainec-salam.vercel.app',
    credentials: true,
  });

  // CRITICAL: Vercel does not use app.listen(). 
  // We only call it if we are NOT on Vercel.
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    await app.listen(port);
  }

  // We return the app instance for Vercel
  return app.getHttpAdapter().getInstance();
}

// Export the bootstrap function for Vercel's serverless handler
export default bootstrap(); 
