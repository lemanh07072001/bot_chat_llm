# Chat Center — Demos

## Nhúng widget vào website bất kỳ (`widget-embed`)

Một website hoàn toàn độc lập, chỉ dán đúng một thẻ `<script>` để có hộp chat realtime.
Trang khách, bundle widget và API nằm trên ba origin khác nhau, nên demo này cũng
chứng minh luôn đường cross-origin.

```bash
cd app/widget && npm run build   # sinh dist/widget.js
node demos/serve.mjs             # chạy từ thư mục gốc dự án
```

| Địa chỉ | Vai trò |
|---|---|
| `http://localhost:4500` | "Website khách hàng" |
| `http://localhost:4173/widget.js` | "CDN" phát bundle widget |

Mở trang với site key lấy từ admin panel:

```
http://localhost:4500/?key=pk_...&api=http://localhost:3002/api&widget=http://localhost:4173/widget.js
```

Cần có API và MongoDB đang chạy. Mở `/inbox` trong admin panel ở một tab khác để
trả lời và thấy tin nhắn chạy realtime hai chiều.

---

# Bộ 10 Mẫu Giao Diện Auth Apple Clean Luxury & Light Bento

Bộ sưu tập giao diện xác thực đẳng cấp dành riêng cho Chat Center, được thiết kế theo phong cách **Apple Clean Luxury & Light Bento** (cảm hứng từ ngôn ngữ thiết kế của Apple, macOS Sequoia, iOS và Linear White).

Hoàn toàn loại bỏ những khối cầu tím neon mờ đại trà của AI, phong cách giấy báo cổ hay cơ khí nặng nề. Toàn bộ 10 trang được khoác lên màu **trắng sứ thuần khiết (Porcelain White)**, các card bento bo góc tinh tế vừa phải (`rounded-2xl` cho khung chính, `rounded-xl` cho sub-card, `rounded-lg` cho form fields), đường viền hairline siêu mỏng và sắc xanh biểu tượng Apple Blue (`#0071E3`).

---

## 10 Mẫu Giao Diện Apple Clean Bento Suite

| Mẫu | Tên Giao Diện | Đường Dẫn URL | Tinh Thần Thẩm Mỹ Chuẩn Apple |
|---|---|---|---|
| **01** | **Apple Bento Split** | `/demos/auth/01-login-split` | Bố cục Bento chia đôi; nửa trái trưng bày thành tựu kiến trúc hỗ trợ khách hàng, nửa phải là form đăng nhập trắng sứ thuần khiết với Google & GitHub SSO. |
| **02** | **Linear Minimal White** | `/demos/auth/02-login-minimal` | Phong cách tối giản thuần trắng (Porcelain Card); hỗ trợ Touch ID / Passkey, phím tắt `[⌘ Enter]`, tự động nhận diện domain SSO công ty. |
| **03** | **Setup Assistant 3-Step** | `/demos/auth/03-register-steps` | Khởi tạo Workspace 3 bước phong cách Apple Setup Assistant; thanh tiến trình mượt mà, đo độ mạnh mật khẩu chuẩn Apple, tạo subdomain tức thì. |
| **04** | **Instant Magic Link** | `/demos/auth/04-magic-link` | Trải nghiệm đăng nhập không cần mật khẩu phong cách Apple Mail; màn hình kiểm tra hộp thư với hiệu ứng tỏa sáng, đếm ngược 60s, mở nhanh Gmail/Outlook. |
| **05** | **Security Key (2FA)** | `/demos/auth/05-two-factor` | Màn hình xác thực 2 lớp chuẩn Apple với 6 ô nhập bo tròn auto-advance, hỗ trợ dán mã từ Clipboard và chuyển đổi mã dự phòng. |
| **06** | **Enterprise Directory SSO** | `/demos/auth/06-sso-enterprise` | Cổng định danh doanh nghiệp lớn; tự động phân luồng xác thực qua Okta, Microsoft Entra ID (Azure AD), Google Workspace từ email công ty. |
| **07** | **Account Recovery** | `/demos/auth/07-forgot-password` | Luồng gửi yêu cầu khôi phục tài khoản với giao diện tinh gọn, đính kèm thông báo bảo mật chống lừa đảo (Anti-Phishing) chuẩn Apple. |
| **08** | **Password Calibration** | `/demos/auth/08-reset-password` | Màn hình đặt lại mật khẩu với danh sách tiêu chí bảo mật hiển thị tích xanh thời gian thực theo từng ký tự nhập vào. |
| **09** | **Team Invitation Accept** | `/demos/auth/09-team-invite` | Màn hình chấp nhận lời mời gia nhập workspace cộng tác phong cách Figma / Apple; thẻ người mời Sarah Miller, avatar stack 22 thành viên. |
| **10** | **macOS Session Lock** | `/demos/auth/10-lock-screen` | Màn hình khóa phiên làm việc khi rời máy sau 15 phút không thao tác; avatar người dùng Michael Chang, mở khóa nhanh bằng PIN hoặc Touch ID. |

---

## Hướng Dẫn Trải Nghiệm

1. Mở terminal trong thư mục `app/admin`:
   ```bash
   npm run dev
   ```
2. Mở trình duyệt và truy cập:
   👉 **[http://localhost:3001/demos/auth](http://localhost:3001/demos/auth)**
