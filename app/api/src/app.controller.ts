import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppService } from './app.service.js';
import { Public } from './auth/public.decorator.js';

/** readyState 1 is "connected"; see mongoose's ConnectionStates. */
const MONGOOSE_CONNECTED = 1;

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Probed by the container runtime and the reverse proxy. Answers 503 while
   * the database is unreachable, so a half-up instance is not sent traffic.
   */
  @Public()
  @Get('health')
  health(): { status: 'ok'; db: true; uptime: number } {
    const uptime = Math.round(process.uptime());

    if (this.connection.readyState !== MONGOOSE_CONNECTED) {
      throw new ServiceUnavailableException({ status: 'degraded', db: false, uptime });
    }

    return { status: 'ok', db: true, uptime };
  }
}
