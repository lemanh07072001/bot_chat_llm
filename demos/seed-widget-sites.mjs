/**
 * Seeds the ten sites the widget gallery shows, one demo per site so every
 * card has its own public key and its own theme.
 *
 *   node demos/seed-widget-sites.mjs
 *
 * Safe to re-run: a site is matched by name and its existing key is reused, so
 * no duplicate project is ever created. The result is written to
 * demos/widget-gallery/sites.json, which the gallery page fetches.
 *
 * Needs the api running and an admin account (see ADMIN_EMAIL / ADMIN_PASSWORD).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = process.env.API_URL ?? 'http://127.0.0.1:3002/api';
const EMAIL = process.env.ADMIN_EMAIL ?? 'demo@chatcenter.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Demo@12345';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'widget-gallery');
const OUT_FILE = join(OUT_DIR, 'sites.json');

const ALLOWED_ORIGINS = [
  'http://localhost:4500',
  'http://127.0.0.1:4500',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const DEMOS = [
  {
    name: 'Tiệm Bánh Mộc',
    themeColor: '#B45309',
    greeting: 'Bánh mới ra lò mỗi 4 tiếng. Bạn cần tư vấn đặt bánh?',
    title: 'Tiệm Bánh Mộc',
  },
  {
    name: 'Spa Sen Hồng',
    themeColor: '#DB2777',
    greeting: 'Chào bạn! Cần đặt lịch chăm sóc da hay massage không?',
    title: 'Spa Sen Hồng',
  },
  {
    name: 'Nội Thất Gỗ Việt',
    themeColor: '#92400E',
    greeting: 'Cần báo giá nội thất phòng khách? Nhắn mình nhé!',
    title: 'Nội Thất Gỗ Việt',
  },
  {
    name: 'Du Lịch Biển Xanh',
    themeColor: '#0891B2',
    greeting: 'Bạn muốn đi biển ở đâu mùa này? Mình tư vấn tour.',
    title: 'Du Lịch Biển Xanh',
  },
  {
    name: 'Phòng Gym Titan',
    themeColor: '#DC2626',
    greeting: 'Sẵn sàng tập luyện? Hỏi mình về gói tập và PT nhé!',
    title: 'Phòng Gym Titan',
  },
  {
    name: 'Hiệu Sách Trí Tuệ',
    themeColor: '#4F46E5',
    greeting: 'Bạn đang tìm sách gì? Mình gợi ý đầu sách phù hợp.',
    title: 'Hiệu Sách Trí Tuệ',
  },
  {
    name: 'Nha Khoa An Nhiên',
    themeColor: '#0D9488',
    greeting: 'Đặt lịch khám răng miễn phí, không đau, không chờ.',
    title: 'Nha Khoa An Nhiên',
  },
  {
    name: 'Cà Phê Mộc Trà',
    themeColor: '#166534',
    greeting: 'Hôm nay bạn uống gì? Mình gợi ý món mới.',
    title: 'Cà Phê Mộc Trà',
  },
  {
    name: 'Thời Trang Lụa Việt',
    themeColor: '#7C3AED',
    greeting: 'Cần tư vấn size và chất liệu lụa? Nhắn mình ngay.',
    title: 'Thời Trang Lụa Việt',
  },
  {
    name: 'Công Nghệ TechOne',
    themeColor: '#0071E3',
    greeting: 'Cần hỗ trợ kỹ thuật? Chat ngay, mình xử lý trong 5 phút.',
    title: 'Công Nghệ TechOne',
  },
];

/** One fetch wrapper: JSON in, JSON out, and a readable message when it fails. */
async function call(path, { method = 'GET', token, body } = {}) {
  const headers = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      (data && (Array.isArray(data.message) ? data.message.join('; ') : data.message)) ??
      text ??
      '';

    throw new Error(`HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
  }

  return data;
}

async function login() {
  try {
    const result = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });

    if (!result || !result.accessToken) {
      throw new Error('phản hồi đăng nhập không có accessToken');
    }

    return result.accessToken;
  } catch (error) {
    console.error(`Không đăng nhập được (${EMAIL}): ${error.message}`);
    console.error('Kiểm tra: API đã chạy chưa? Tài khoản admin đã tồn tại chưa?');
    console.error(`API URL: ${API}`);
    console.error('Có thể đổi bằng biến môi trường API_URL / ADMIN_EMAIL / ADMIN_PASSWORD.');
    process.exit(1);
  }
}

async function listSites(token) {
  try {
    const sites = await call('/sites', { token });

    return Array.isArray(sites) ? sites : [];
  } catch (error) {
    console.error(`Không đọc được danh sách site: ${error.message}`);
    process.exit(1);
  }
}

async function createSite(token, demo) {
  return call('/sites', {
    method: 'POST',
    token,
    body: {
      name: demo.name,
      allowedOrigins: ALLOWED_ORIGINS,
      settings: { title: demo.title, themeColor: demo.themeColor, greeting: demo.greeting },
    },
  });
}

const token = await login();
const existing = await listSites(token);

// Matching by name is what makes a second run a no-op instead of a duplicate.
const byName = new Map(
  existing.filter((site) => site && typeof site.name === 'string').map((site) => [site.name.trim(), site]),
);

const gallery = [];

for (const demo of DEMOS) {
  const found = byName.get(demo.name);

  if (found && found.publicKey) {
    console.log(`da co    ${demo.name}  (${found.publicKey})`);
    gallery.push({
      name: demo.name,
      publicKey: found.publicKey,
      title: demo.title,
      themeColor: demo.themeColor,
      greeting: demo.greeting,
    });
    continue;
  }

  if (found) {
    // The api hides publicKey from project managers, so the account has to be
    // the owner; creating a second site with the same name would be worse.
    console.error(`da co    ${demo.name}  — nhưng tài khoản không thấy public key (cần là chủ dự án).`);
    process.exit(1);
  }

  let created;

  try {
    created = await createSite(token, demo);
  } catch (error) {
    console.error(`tao moi  ${demo.name}  — thất bại: ${error.message}`);
    process.exit(1);
  }

  console.log(`tao moi  ${demo.name}  (${created.publicKey})`);
  gallery.push({
    name: demo.name,
    publicKey: created.publicKey,
    title: demo.title,
    themeColor: demo.themeColor,
    greeting: demo.greeting,
  });
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_FILE, `${JSON.stringify(gallery, null, 2)}\n`, 'utf8');

const sttWidth = 3;
const nameWidth = Math.max(...gallery.map((site) => site.name.length), 'Tên site'.length);

console.log('');
console.log(`${'STT'.padEnd(sttWidth)} | ${'Tên site'.padEnd(nameWidth)} | public key`);
console.log(`${'-'.repeat(sttWidth)}-+-${'-'.repeat(nameWidth)}-+-----------`);

gallery.forEach((site, index) => {
  console.log(`${String(index + 1).padEnd(sttWidth)} | ${site.name.padEnd(nameWidth)} | ${site.publicKey}`);
});

console.log('');
console.log(`Đã ghi ${OUT_FILE}`);
console.log('Gallery: http://localhost:4500/gallery');
