/**
 * Serves the embed demo the way production would: the customer page, the
 * widget bundle and the api all live on different origins, so this also
 * exercises the cross-origin path. The gallery at /gallery lists ten sites,
 * one public key each, so any single widget theme can be opened on demand.
 *
 *   node demos/serve.mjs
 *
 *   http://localhost:4500          the "customer website"
 *   http://localhost:4500/gallery  the ten-site widget gallery
 *   http://localhost:4173          the "CDN" serving widget.js
 *
 * Build the widget first: cd app/widget && npm run build
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = join(here, 'widget-embed', 'index.html');
const GALLERY_DIR = join(here, 'widget-gallery');
const WIDGET_DIR = join(here, '..', 'app', 'widget', 'dist');

const SITE_PORT = 4500;
const CDN_PORT = 4173;

async function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

createServer(async (req, res) => {
  // The gallery is a separate page on the same "customer site" origin; its
  // sites.json sits next to it so the page can fetch it relatively.
  const path = (req.url ?? '/').split('?')[0];

  if (path === '/gallery' || path === '/gallery/') {
    try {
      const gallery = await readFile(join(GALLERY_DIR, 'index.html'));
      await send(res, 200, gallery, 'text/html; charset=utf-8');
    } catch {
      await send(res, 404, 'gallery page not found', 'text/plain; charset=utf-8');
    }
    return;
  }

  if (path === '/gallery/sites.json') {
    try {
      const list = await readFile(join(GALLERY_DIR, 'sites.json'));
      await send(res, 200, list, 'application/json; charset=utf-8');
    } catch {
      await send(res, 404, 'sites.json not found', 'text/plain; charset=utf-8');
    }
    return;
  }

  try {
    const html = await readFile(PAGE);
    await send(res, 200, html, 'text/html; charset=utf-8');
  } catch {
    await send(res, 404, 'demo page not found', 'text/plain; charset=utf-8');
  }
}).listen(SITE_PORT, () => {
  console.log(`customer site  http://localhost:${SITE_PORT}`);
  console.log(`gallery        http://localhost:${SITE_PORT}/gallery`);
});

createServer(async (req, res) => {
  // The bundle is fetched by pages on other origins, so it needs CORS.
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = (req.url ?? '/').split('?')[0];
  // The picker's dataset and font live next to the bundle, under both the
  // canonical /v1/assets/ prefix and the unversioned alias.
  const assetMatch = /^(?:\/v1)?\/assets\/(emoji-data\.json|chat-emoji-fill\.woff2)$/.exec(url);

  if (assetMatch) {
    const file = assetMatch[1];
    const type = file.endsWith('.json')
      ? 'application/json; charset=utf-8'
      : 'font/woff2';

    try {
      const body = await readFile(join(WIDGET_DIR, 'assets', file));
      await send(res, 200, body, type);
    } catch {
      await send(res, 404, `asset ${file} missing`, 'text/plain; charset=utf-8');
    }
    return;
  }

  const name = req.url === '/widget.mjs' ? 'widget.mjs' : 'widget.js';

  try {
    const file = await readFile(join(WIDGET_DIR, name));
    await send(res, 200, file, 'text/javascript; charset=utf-8');
  } catch {
    await send(
      res,
      404,
      '// widget bundle missing — run: cd app/widget && npm run build',
      'text/javascript; charset=utf-8',
    );
  }
}).listen(CDN_PORT, () => {
  console.log(`widget bundle  http://localhost:${CDN_PORT}/widget.js`);
});
