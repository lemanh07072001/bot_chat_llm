# Chat Center

Chat realtime nhúng vào website bất kỳ bằng **một thẻ `<script>` + một token**.
Khách truy cập chat ẩn danh trên website của bạn, nhân viên trả lời trong admin
panel, tin nhắn đi qua WebSocket theo thời gian thực.

## Cấu trúc

| Thư mục | Công nghệ | Cổng dev | Vai trò |
|---|---|---|---|
| `api/` | NestJS + MongoDB (Mongoose) + Socket.IO | 3002 | REST API, WebSocket gateway, và **tự serve bundle widget** tại `/v1/widget.js` |
| `admin/` | Next.js (App Router) + Tailwind | 3000 | Panel nhân viên: hộp thư đến realtime, quản lý site & người dùng |
| `widget/` | TypeScript + Vite (library) | 5173 | Hộp chat nhúng vào web khách: bundle IIFE độc lập, Shadow DOM |
| `docker/` | Dockerfile, Nginx, script backup | — | Hạ tầng triển khai — xem [DEPLOY.md](DEPLOY.md) |

Bản demo nhúng widget vào một website độc lập nằm ở `demos/widget-embed` (một
cấp trên thư mục này).

## Chạy môi trường dev

Cần Node 22+ và một MongoDB đang chạy ở `localhost:27017`.

```bash
# 1. Cài thư viện
(cd api && npm install) && (cd admin && npm install) && (cd widget && npm install)

# 2. Khai báo cấu hình
cp api/.env.example api/.env          # sửa JWT_SECRET
cp admin/.env.example admin/.env.local

# 3. Build widget một lần — API đọc bundle từ widget/dist
(cd widget && npm run build)

# 4. Chạy
(cd api && npm run start:dev)         # http://localhost:3002/api
(cd admin && npm run dev)             # http://localhost:3000
```

Mở `http://localhost:3000/register` — **người đăng ký đầu tiên tự động là
admin**, và ngay sau đó đăng ký công khai tự đóng lại (nhân viên về sau do admin
tạo trong *Quản lý người dùng*). Sau đó vào *Kênh kết nối → Live Chat Widget*
để tạo dự án và lấy đoạn mã nhúng.

## Dự án và phân quyền

Mỗi website là một **dự án** (`Site` trong mã nguồn): một public key, một bộ cấu
hình, một hàng đợi hội thoại riêng.

| Vai trò | Có được gì |
|---|---|
| **Admin** | Tạo dự án mới. Dự án mình tạo thì mình là người tạo dự án. |
| **Người tạo dự án** | Toàn quyền trên dự án đó: cấu hình, mã nhúng, public key, thêm/bớt người, chuyển hội thoại cho người khác. |
| **Manager** | Người được thêm vào một dự án: xem và trả lời hội thoại của **đúng dự án đó**. Không thấy key, không sửa cấu hình, không thêm người. |

Phạm vi này được áp ở một chỗ duy nhất (`SitesService.listAccessible` /
`accessForSite`) và mọi đường đi đều đi qua nó: danh sách dự án, hội thoại, tin
nhắn và cả room socket. Thu hồi quyền có hiệu lực ngay trên socket đang mở, chứ
không chờ người đó tải lại trang.

Hội thoại có thể **nhận** (ai cũng nhận được hội thoại chưa ai phụ trách, hai
người bấm cùng lúc thì chỉ một người thắng), **chuyển** cho đồng nghiệp trong dự
án (chỉ người tạo dự án), **bỏ phân công**, và **kết thúc / mở lại**. Khách gửi
tin vào hội thoại đã kết thúc thì hội thoại tự mở lại.

Mỗi dự án khai được **giờ làm việc** theo múi giờ của mình. Ngoài giờ, widget
hiện lời nhắn đã cấu hình và xin email của khách — khách vẫn gửi tin được bất kỳ
lúc nào, việc khai giờ chỉ để họ biết khi nào được trả lời.

Khi sửa mã nguồn widget, build lại (`cd widget && npm run build`) là API phục vụ
bản mới ngay — nó phát hiện bundle thay đổi qua mtime, không cần restart. Nếu
muốn vòng lặp nhanh hơn thì dùng sân chơi dev: `cd widget && npm run dev`, mở
`http://localhost:5173/?key=pk_…`.

## Nhúng vào website

```html
<script src="http://localhost:3002/v1/widget.js" data-chat-center-key="pk_..." async></script>
```

Widget tự suy ra địa chỉ API từ chính `src` của nó, nên snippet không cần thuộc
tính nào khác khi API và bundle cùng origin. Admin panel hiển thị sẵn đoạn mã
đúng để copy. Chi tiết tùy biến: [widget/README.md](widget/README.md).

`pk_...` nằm công khai trong mã nguồn trang nên **không phải mật khẩu**. Hai lớp
chặn thật sự là **origin allowlist** của từng site và **phạm vi token khách** —
JWT scope `visitor` bị khóa cứng vào đúng một hội thoại.

## Đường dẫn của API

| Đường dẫn | Mô tả |
|---|---|
| `/api/*` | REST: auth, sites, conversations, widget session |
| `/socket.io/` | WebSocket realtime cho cả khách và nhân viên |
| `/v1/widget.js` | Bundle widget (kênh tương thích v1), cache ngắn + ETag |
| `/v1/widget.mjs` | Bản ES module cho trang muốn `import` |
| `/widget.js` | Alias không đánh version, giữ cho snippet cũ |
| `/api/health` | Health check, trả 503 khi mất kết nối database |

Các endpoint chính dành cho nhân viên: `/api/sites` (+ `/:id/members`),
`/api/conversations` (+ `/:id/claim|assign|release|close|reopen`), và
`/api/widget/session|messages|contact` dành cho khách.

## Kiểm thử & lint

```bash
(cd api && npm test)        # vitest
(cd api && npm run lint)    # oxlint
(cd admin && npm run lint)  # eslint
(cd admin && npm run build) # typecheck + build
```

## Triển khai production

Docker Compose + Nginx trên một VPS: xem [DEPLOY.md](DEPLOY.md) để có runbook
đầy đủ (DNS, chứng chỉ TLS, backup, cập nhật, chẩn đoán).
