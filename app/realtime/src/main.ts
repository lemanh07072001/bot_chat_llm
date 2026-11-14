import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RealtimeAppModule } from './realtime-app.module.js';
process.env.SERVICE_ROLE = 'realtime';
const app = await NestFactory.create(RealtimeAppModule);
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT || 3003), process.env.HOST || '0.0.0.0');
