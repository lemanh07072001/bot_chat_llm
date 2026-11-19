import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { corsMiddleware, parseAllowlist } from './cors.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy the client address arrives in X-Forwarded-For, and
  // the per-IP rate limits are worthless without it. Off by default, because
  // trusting that header while directly exposed would let any client forge its
  // own address: TRUST_PROXY says how many proxies sit in front.
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);

  if (Number.isInteger(trustProxy) && trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  app.use(corsMiddleware(parseAllowlist(process.env.CORS_ORIGINS)));
  // The widget bundle is served from the api origin so the embed snippet can be
  // a plain script url; those routes must stay outside the `api` prefix.
  app.setGlobalPrefix('api', {
    exclude: [
      'widget.js',
      'v1/widget.js',
      'v1/widget.mjs',
      'v1/assets/emoji-data.json',
      'v1/assets/chat-emoji-fill.woff2',
      'assets/emoji-data.json',
      'assets/chat-emoji-fill.woff2',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Inside a container the port has to be bound on every interface, not just
  // loopback, for the reverse proxy to reach it.
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}
await bootstrap();
