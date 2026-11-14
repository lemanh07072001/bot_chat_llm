import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WidgetAssetName = 'widget.js' | 'widget.mjs';

export interface WidgetAsset {
  name: WidgetAssetName;
  body: Buffer;
  /** Content hash, used as the ETag so a revalidation costs no bandwidth. */
  hash: string;
  builtAt: Date;
  size: number;
}

/** Keyed by mtime+size: a rebuild changes both, so the cache self-invalidates. */
interface CacheEntry {
  stamp: string;
  asset: WidgetAsset;
}

/**
 * Serves the built widget bundle straight off disk. Keeping the bundle on the
 * same origin as the api means the embed snippet needs nothing but the key —
 * the widget derives its api url from its own script src — and the two can
 * never drift apart in version.
 */
@Injectable()
export class WidgetAssetService {
  private readonly logger = new Logger(WidgetAssetService.name);
  private readonly cache = new Map<WidgetAssetName, CacheEntry>();
  private readonly dir: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('WIDGET_ASSET_DIR');

    // Default assumes the dev layout, where the api runs from app/api and the
    // widget writes its bundle to app/widget/dist.
    this.dir = configured
      ? isAbsolute(configured)
        ? configured
        : resolve(process.cwd(), configured)
      : resolve(process.cwd(), '..', 'widget', 'dist');
  }

  get assetDir(): string {
    return this.dir;
  }

  async load(name: WidgetAssetName): Promise<WidgetAsset> {
    const path = join(this.dir, name);

    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(path);
    } catch {
      this.logger.error(`Widget bundle missing at ${path} — run \`npm run build\` in widget/`);
      throw new ServiceUnavailableException('Widget bundle is not built yet');
    }

    const stamp = `${stats.mtimeMs}:${stats.size}`;
    const cached = this.cache.get(name);

    if (cached?.stamp === stamp) {
      return cached.asset;
    }

    const body = await readFile(path);
    const asset: WidgetAsset = {
      name,
      body,
      hash: createHash('sha256').update(body).digest('hex').slice(0, 16),
      builtAt: stats.mtime,
      size: stats.size,
    };

    this.cache.set(name, { stamp, asset });

    return asset;
  }

  /** Build info for the admin panel, so an operator can tell which bundle is live. */
  async describe(): Promise<{ channel: string; hash: string; size: number; builtAt: string }> {
    const asset = await this.load('widget.js');

    return {
      channel: 'v1',
      hash: asset.hash,
      size: asset.size,
      builtAt: asset.builtAt.toISOString(),
    };
  }
}
