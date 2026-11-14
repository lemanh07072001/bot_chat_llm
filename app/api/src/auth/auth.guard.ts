import { isValidObjectId } from 'mongoose';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { JwtPayload } from './jwt-payload.type.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // As a global guard this also wraps websocket handlers, which have no HTTP
    // request to read a bearer header from. Socket identity is established once
    // during the gateway handshake instead, and every handler checks it.
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    // Visitor tokens are minted for anyone holding a site public key, so they
    // must never satisfy an agent-guarded route.
    if (payload.scope !== undefined && payload.scope !== 'agent') {
      throw new UnauthorizedException();
    }

    if (!isValidObjectId(payload.sub)) {
      throw new UnauthorizedException();
    }

    // Database errors propagate as 500 rather than being masked as 401.
    const user = await this.usersService.findAuthState(payload.sub);

    if (!user || payload.ver !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException();
    }

    request.user = payload;

    return true;
  }

  private extractTokenFromHeader(request: { headers: Record<string, string | undefined> }): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
