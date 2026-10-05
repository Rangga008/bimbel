import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Tampilkan stack trace asli di log server saat 500 (tetap 500 generik ke client).
    abortOnError: false,
  });

  app.use(helmet());
  app.use(cookieParser());
  // CORS_ORIGIN boleh berisi beberapa origin dipisah koma — mis.
  // "https://bimbel.example.com,https://www.bimbel.example.com" saat deploy.
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? ['http://localhost:3001'],
    credentials: true,
  });

  // Di balik reverse proxy (nginx/Cloudflare) req.ip & rate limiter perlu
  // mempercayai X-Forwarded-For — aktifkan via TRUST_PROXY=1 saat deploy.
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Peringatan keras bila secret default dev ikut terbawa ke produksi —
  // JWT yang ditandatangani secret publik berarti siapa pun bisa menempa token.
  if (
    process.env.NODE_ENV === 'production' &&
    (process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me') ===
      'dev-access-secret-change-me'
  ) {
    console.error(
      '[SECURITY] JWT_ACCESS_SECRET masih nilai default dev — WAJIB diganti ' +
        'dengan secret acak sebelum API dipublikasikan ke internet!',
    );
  }
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Log error tak tertangani ke stderr supaya terlihat saat dijalankan via
  // Start-Process -WindowStyle Hidden (tanpa console).
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (reason) => {
    console.error('[uncaughtException]', reason);
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
