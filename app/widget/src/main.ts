// Dev playground only (npm run dev). The published entry is src/index.ts.
// Pass a site key with ?key=pk_… or set VITE_PUBLIC_KEY in .env.
import { init } from './index';

const publicKey =
  new URLSearchParams(window.location.search).get('key') ?? import.meta.env.VITE_PUBLIC_KEY ?? '';

const target = document.querySelector<HTMLDivElement>('#app');

if (!publicKey) {
  if (target) {
    target.textContent = 'Add ?key=pk_… to the URL (create a site in the admin panel to get one).';
  }
} else {
  init({
    publicKey,
    apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
    // Vite serves `public/` from the dev server root, so the assets are here.
    assetBaseUrl: new URL('/assets/', window.location.href).href,
  });
}
