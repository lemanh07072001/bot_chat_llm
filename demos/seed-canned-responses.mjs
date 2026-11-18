/**
 * Seeds the quick replies the demo projects show in the inbox composer: one
 * shared set for the whole installation, plus a small set per demo project.
 *
 *   node demos/seed-canned-responses.mjs
 *
 * Safe to re-run. A set is written only while it has never been saved
 * (version 0), so a set an operator edited or deliberately emptied is left
 * exactly as they left it.
 *
 * Needs the api running and an admin account (ADMIN_EMAIL / ADMIN_PASSWORD).
 * The demo projects come from demos/seed-widget-sites.mjs; run that first.
 */
const API = process.env.API_URL ?? 'http://127.0.0.1:3002/api';
const EMAIL = process.env.ADMIN_EMAIL ?? 'demo@chatcenter.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Demo@12345';

/** Every project may show both sets; the operator can change that per project. */
const MODE = 'both';

const GLOBAL_TEMPLATES = [
  {
    title: 'Chào khách',
    shortcut: 'chao',
    text: 'Xin chào quý khách, em có thể hỗ trợ gì cho mình ạ? 👋',
  },
  {
    title: 'Đang kiểm tra',
    shortcut: 'doi',
    text: 'Dạ bên em đã tiếp nhận thông tin, xin quý khách đợi trong giây lát ạ! ⏳',
  },
  {
    title: 'Đã giải quyết',
    shortcut: 'xong',
    text: 'Dạ vấn đề đã được giải quyết rồi ạ. Quý khách cần hỗ trợ thêm gì không ạ? ✨',
  },
  {
    title: 'Cảm ơn',
    shortcut: 'cam-on',
    text: 'Cảm ơn quý khách đã liên hệ. Chúc quý khách một ngày tốt lành! 🙏',
  },
];

/** Three replies per demo project, written the way that shop would answer. */
const SITE_TEMPLATES = {
  'Tiệm Bánh Mộc': [
    { title: 'Bảng giá bánh', shortcut: 'gia-banh', text: 'Dạ bánh bông lan 150.000đ/ổ, bánh kem 250.000đ/ổ ạ. Quý khách muốn đặt loại nào?' },
    { title: 'Đặt bánh trước', shortcut: 'dat-banh', text: 'Quý khách đặt trước 24 giờ giúp tiệm chuẩn bị bánh tươi ạ. Cho em xin ngày giờ nhận bánh nhé!' },
    { title: 'Giao trong ngày', shortcut: 'giao-hang', text: 'Nội thành em giao trong 2 giờ, phí 25.000đ. Quý khách cho em xin địa chỉ ạ.' },
  ],
  'Spa Sen Hồng': [
    { title: 'Bảng giá dịch vụ', shortcut: 'bang-gia', text: 'Facial cơ bản 350.000đ, massage body 60 phút 450.000đ ạ. Quý khách muốn đặt dịch vụ nào?' },
    { title: 'Đặt lịch', shortcut: 'dat-lich', text: 'Quý khách muốn đặt lịch ngày nào ạ? Em còn slot 9h, 14h và 18h.' },
    { title: 'Ưu đãi tháng', shortcut: 'uu-dai', text: 'Tháng này mua 5 buổi tặng 1 buổi ạ. Em giữ ưu đãi cho quý khách nhé?' },
  ],
  'Nội Thất Gỗ Việt': [
    { title: 'Xin kích thước', shortcut: 'kich-thuoc', text: 'Quý khách cho em xin chiều dài và chiều rộng phòng để em báo giá chính xác ạ.' },
    { title: 'Thời gian sản xuất', shortcut: 'thoi-gian', text: 'Đơn hàng đóng theo yêu cầu mất 15–20 ngày ạ. Em báo tiến độ từng tuần cho quý khách.' },
    { title: 'Bảo hành', shortcut: 'bao-hanh', text: 'Sản phẩm gỗ tự nhiên được bảo hành 24 tháng, hỗ trợ sửa chữa trọn đời ạ.' },
  ],
  'Du Lịch Biển Xanh': [
    { title: 'Tour đang mở', shortcut: 'tour', text: 'Em đang có tour Phú Quốc 3 ngày 2 đêm 3.990.000đ/khách. Quý khách đi mấy người ạ?' },
    { title: 'Lịch khởi hành', shortcut: 'khoi-hanh', text: 'Tour khởi hành thứ 5 và thứ 7 hằng tuần ạ. Quý khách muốn đi ngày nào?' },
    { title: 'Bao gồm gì', shortcut: 'bao-gom', text: 'Giá tour gồm vé máy bay, khách sạn 4 sao, ăn sáng và xe đưa đón ạ.' },
  ],
  'Phòng Gym Titan': [
    { title: 'Gói tập', shortcut: 'goi-tap', text: 'Gói tháng 700.000đ, gói 6 tháng 3.600.000đ, gói năm 6.000.000đ ạ. Quý khách tập mấy buổi/tuần?' },
    { title: 'Tập thử', shortcut: 'tap-thu', text: 'Bên em tặng 1 buổi tập thử miễn phí kèm PT ạ. Quý khách qua lúc nào tiện?' },
    { title: 'Huấn luyện viên', shortcut: 'pt', text: 'PT 1-1 là 300.000đ/buổi, gói 10 buổi còn 2.700.000đ ạ.' },
  ],
  'Hiệu Sách Trí Tuệ': [
    { title: 'Tìm sách', shortcut: 'tim-sach', text: 'Quý khách cho em xin tên sách hoặc chủ đề, em kiểm tra tồn kho ngay ạ.' },
    { title: 'Đặt trước', shortcut: 'dat-truoc', text: 'Sách chưa có sẵn em đặt về trong 3–5 ngày, quý khách để lại số điện thoại giúp em ạ.' },
    { title: 'Giao sách', shortcut: 'giao-sach', text: 'Đơn từ 200.000đ miễn phí giao hàng toàn quốc ạ. Quý khách ở tỉnh nào?' },
  ],
  'Nha Khoa An Nhiên': [
    { title: 'Đặt lịch khám', shortcut: 'dat-lich', text: 'Em còn lịch 8h30, 15h và 17h30 ngày mai ạ. Quý khách chọn giúp em khung nào?' },
    { title: 'Bảng giá', shortcut: 'bang-gia', text: 'Khám và tư vấn miễn phí, cạo vôi răng 300.000đ, trám răng 400.000đ ạ.' },
    { title: 'Bảo hiểm', shortcut: 'bao-hiem', text: 'Bên em nhận thanh toán bảo hiểm y tế và bảo hiểm tư nhân ạ. Quý khách dùng loại nào?' },
  ],
  'Cà Phê Mộc Trà': [
    { title: 'Món mới', shortcut: 'mon-moi', text: 'Tuần này em có trà đào cam sả và cà phê muối ạ. Quý khách thử món nào?' },
    { title: 'Đặt ship', shortcut: 'dat-ship', text: 'Quý khách cho em xin địa chỉ và số điện thoại, em gửi shipper trong 20 phút ạ.' },
    { title: 'Giờ mở cửa', shortcut: 'gio-mo', text: 'Quán mở 7h–22h hằng ngày, cuối tuần vẫn mở ạ.' },
  ],
  'Thời Trang Lụa Việt': [
    { title: 'Tư vấn size', shortcut: 'size', text: 'Quý khách cho em xin chiều cao và cân nặng, em chọn size chuẩn giúp mình ạ.' },
    { title: 'Chất liệu', shortcut: 'chat-lieu', text: 'Bên em có lụa tơ tằm 100% và lụa pha. Quý khách thích loại nào ạ?' },
    { title: 'Đổi trả', shortcut: 'doi-tra', text: 'Đổi size trong 7 ngày, sản phẩm còn nguyên tem ạ.' },
  ],
  'Công Nghệ TechOne': [
    { title: 'Báo lỗi kỹ thuật', shortcut: 'bao-loi', text: 'Quý khách mô tả giúp em lỗi đang gặp và tên thiết bị, em kiểm tra ngay ạ.' },
    { title: 'Bảo hành', shortcut: 'bao-hanh', text: 'Thiết bị được bảo hành 12 tháng. Quý khách cho em xin số serial trên máy ạ.' },
    { title: 'Đổi máy', shortcut: 'doi-may', text: 'Máy lỗi trong 7 ngày đầu được đổi mới 1-1 ạ. Quý khách mua ngày nào?' },
  ],
};

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
    const result = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    });

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

const token = await login();

// --- Shared set -------------------------------------------------------------

const global = await call('/canned-responses/global', { token });

if (global.version === 0) {
  await call('/canned-responses/global', {
    method: 'PUT',
    token,
    body: { version: 0, templates: GLOBAL_TEMPLATES },
  });
  console.log(`tao moi  bộ chung   (${GLOBAL_TEMPLATES.length} mẫu)`);
} else {
  console.log(`da co    bộ chung   (bản ${global.version}, ${global.templates.length} mẫu)`);
}

// --- One set per demo project ----------------------------------------------

const sites = await call('/sites', { token });
const demos = Array.isArray(sites) ? sites : [];
let seeded = 0;

for (const site of demos) {
  const templates = SITE_TEMPLATES[site.name];

  if (!templates) {
    console.log(`bỏ qua   ${site.name}  — không có mẫu demo cho dự án này`);
    continue;
  }

  let current;

  try {
    current = await call(`/sites/${encodeURIComponent(site.id)}/canned-responses`, { token });
  } catch (error) {
    // A project the account only manages cannot be written; that is expected
    // when the seed runs as somebody other than the project owner.
    console.log(`bỏ qua   ${site.name}  — ${error.message}`);
    continue;
  }

  if (current.version > 0) {
    console.log(`da co    ${site.name}  (bản ${current.version}, ${current.templates.length} mẫu)`);
    continue;
  }

  await call(`/sites/${encodeURIComponent(site.id)}/canned-responses`, {
    method: 'PUT',
    token,
    body: { version: 0, templates, mode: MODE },
  });

  seeded += 1;
  console.log(`tao moi  ${site.name}  (${templates.length} mẫu, chế độ ${MODE})`);
}

console.log('');
console.log(`Đã tạo bộ mẫu cho ${seeded} dự án. Mở Hộp thư đến, chọn một hội thoại, bấm “Mẫu câu” hoặc gõ /chao.`);
