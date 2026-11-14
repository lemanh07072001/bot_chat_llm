import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { WidgetAssetService, type WidgetAsset, type WidgetAssetName } from './widget-asset.service.js';

/**
 * `v1` is a compatibility channel, not a build pin: bug fixes keep shipping to
 * the same url so every embedded site gets them without the customer touching
 * their snippet. A breaking change to the widget's behaviour would ship as
 * `/v2/widget.js` instead, leaving old pages on v1.
 *
 * Cache life is therefore deliberately short, with an ETag so a revalidation
 * costs one small request and no bandwidth. A CDN in front may cache it harder
 * as long as it honours the same ETag.
 */
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400';

// These routes sit outside the global `api` prefix — see main.ts — so the embed
// snippet reads as a plain script url.
@Controller()
export class WidgetAssetController {
  constructor(private readonly assets: WidgetAssetService) {}

  /** Unversioned alias, kept so an older snippet still resolves. */
  @Public()
  @Get('widget.js')
  async legacy(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.send('widget.js', request, response);
  }

  @Public()
  @Get('v1/widget.js')
  async script(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.send('widget.js', request, response);
  }

  /** For host pages that would rather `import` the widget than script-tag it. */
  @Public()
  @Get('v1/widget.mjs')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  async module(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.send('widget.mjs', request, response);
  }

  private async send(name: WidgetAssetName, request: Request, response: Response): Promise<void> {
    const asset = await this.assets.load(name);

    this.setHeaders(response, asset);

    // A classic <script> tag sends no conditional header, but a CDN or a page
    // reloaded with a warm cache does.
    if (request.headers['if-none-match'] === `"${asset.hash}"`) {
      response.status(304).end();
      return;
    }

    response.status(200).send(asset.body);
  }

  private setHeaders(response: Response, asset: WidgetAsset): void {
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    response.setHeader('Cache-Control', CACHE_CONTROL);
    response.setHeader('ETag', `"${asset.hash}"`);
    response.setHeader('Last-Modified', asset.builtAt.toUTCString());
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // The bundle is meant to be loaded by any customer page, and it carries no
    // secrets of its own.
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}

/**
 * Build info for the admin panel. Deliberately outside the `/api/widget`
 * prefix, which answers any origin for the sake of embedded widgets — this one
 * is staff-only and stays pinned to CORS_ORIGINS.
 */
@Controller('widget-build')
export class WidgetBuildController {
  constructor(private readonly assets: WidgetAssetService) {}

  @Get()
  async describe() {
    return this.assets.describe();
  }
}
