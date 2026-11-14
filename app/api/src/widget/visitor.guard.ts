import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import { WidgetService } from './widget.service.js';
import type { VisitorJwtPayload } from '../auth/jwt-payload.type.js';

@Injectable()
export class VisitorGuard implements CanActivate {
  constructor(private readonly widgetService: WidgetService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    const [type, token] = authHeader?.split(' ') ?? [];

    request.visitor = await this.widgetService.verifyVisitorToken(type === 'Bearer' ? token : undefined);

    return true;
  }
}

export const CurrentVisitor = createParamDecorator((_data: unknown, ctx: ExecutionContext): VisitorJwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.visitor;
});
