import type { NextFunction, Request, Response } from 'express';

/**
 * Widget routes are called from whatever page embeds the snippet, so they must
 * answer any origin. That is safe here because the API authenticates with
 * `Authorization: Bearer` and sets no cookies, so a third-party page carries no
 * ambient credentials; per-site embedding is gated by the site's own
 * `allowedOrigins` check in WidgetService. Everything else (agent and admin
 * routes) stays pinned to CORS_ORIGINS.
 */
const WIDGET_PATH_PREFIX = '/api/widget';

export function corsMiddleware(allowlist: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    const isWidgetRoute = req.path.startsWith(WIDGET_PATH_PREFIX);
    const allowed = isWidgetRoute || allowlist.length === 0 || (!!origin && allowlist.includes(origin));

    if (origin && allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      res.status(allowed ? 204 : 403).end();
      return;
    }

    next();
  };
}

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
