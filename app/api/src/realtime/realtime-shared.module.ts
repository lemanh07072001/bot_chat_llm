import { RedisBridgeService } from './redis-bridge.service.js';
import { Global, Module } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service.js';
import { RealtimeBusService } from './realtime-bus.service.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { VisitorRegistryService } from './visitor-registry.service.js';

/**
 * Deliberately dependency-free and global. The websocket gateway fills these
 * in, while the sites and chat modules read from them — importing the gateway
 * directly would create a cycle (sites → chat → widget → realtime → chat).
 */
@Global()
@Module({
  providers: [AgentRegistryService, VisitorRegistryService, RealtimeBusService, RateLimiterService, RedisBridgeService],
  exports: [AgentRegistryService, VisitorRegistryService, RealtimeBusService, RateLimiterService, RedisBridgeService],
})
export class RealtimeSharedModule {}
