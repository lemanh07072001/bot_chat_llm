# Chat Center Widget

Hộp chat realtime nhúng vào website bất kỳ bằng **một thẻ `<script>` + một token**.

## Nhúng

```html
<script
  src="https://api.your-domain.com/v1/widget.js"
  data-chat-center-key="pk_..."
  async></script>
```

Bundle do chính API phục vụ (xem `api/src/widget/widget-asset.controller.ts`),
nên widget tự suy ra địa chỉ API từ `src` của mình — không cần khai thêm gì.
Widget cũng tự đọc `data-chat-center-key` từ thẻ script của nó, nên không cần
gọi hàm khởi tạo nào. Lấy `pk_...` bằng cách tạo một Site trong admin panel —
admin hiển thị sẵn đoạn snippet để copy.

`v1` là **kênh tương thích**, không phải bản ghim: bản sửa lỗi vẫn được phát
hành vào đúng URL đó nên mọi website đã nhúng đều nhận được, không phải sửa
snippet. Thay đổi phá vỡ tương thích sẽ ra `/v2/widget.js`.

### Thuộc tính

| Thuộc tính | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `data-chat-center-key` | ✅ | — | Public key của site (`pk_` + 32 hex) |
| `data-api-url` | — | `<origin của script>/api` | Base URL của API, chỉ cần khi bundle được phát hành ở nơi khác (CDN) |
| `data-title` | — | Tiêu đề cấu hình trong admin | Ghi đè tiêu đề hộp chat |

### Dùng bằng JavaScript

Nếu cần tự điều khiển (mở/đóng theo nút của bạn), bỏ `data-chat-center-key` và gọi:

```html
<script src="https://api.your-domain.com/v1/widget.js"></script>
<script>
  const chat = ChatWidget.init({
    publicKey: 'pk_...',
    apiUrl: 'https://api.your-domain.com/api',
  });
  // chat.open() · chat.close() · chat.destroy()
</script>
```

Trang muốn `import` thay vì dùng thẻ script thì lấy bản ES module ở
`/v1/widget.mjs`.

## Thiết kế

- **Shadow DOM** — CSS của website khách không ảnh hưởng widget và ngược lại.
- **Không phụ thuộc framework** — bundle IIFE duy nhất (~17KB gzip, đã gồm socket.io-client).
- **Session lazy** — chỉ tạo bản ghi khách khi họ thật sự mở hộp chat, nên một
  lượt xem trang bình thường không sinh dữ liệu.
- **Chống XSS** — nội dung tin nhắn luôn được gán bằng `textContent`, không bao
  giờ dựng qua `innerHTML`.
- Khách quay lại được nhận diện qua `visitorKey` lưu trong `localStorage`; nếu
  trình duyệt chặn storage thì đơn giản là bắt đầu hội thoại mới.

## Bảo mật

`pk_...` nằm công khai trong mã nguồn trang, nên **nó không phải mật khẩu**. Nó chỉ
cho phép *xin* một phiên khách ẩn danh. Hai lớp chặn thật sự:

1. **Origin allowlist** — mỗi Site có `allowedOrigins`. Để trống nghĩa là nhúng
   được ở mọi origin (mặc định, tiện khi mới tạo); khai báo rồi thì chỉ những
   origin đó được cấp phiên.
2. **Phạm vi token** — phiên khách là JWT scope `visitor`, bị khóa cứng vào đúng
   một hội thoại. Nó không bao giờ đi qua được các API dành cho nhân viên, và
   `conversationId` luôn lấy từ token chứ không lấy từ dữ liệu client gửi lên.

## Phát triển

```bash
npm install
npm run dev     # sân chơi dev, mở http://localhost:5173/?key=pk_...
npm run build   # sinh dist/widget.js (IIFE) và dist/widget.mjs (ES module)
```

Sau khi `npm run build`, API phục vụ bản mới ngay tại
`http://localhost:3002/v1/widget.js` — nó nhận ra bundle đã thay đổi qua mtime
nên không cần restart API.

Xem thêm bản demo nhúng vào một website độc lập ở `demos/widget-embed` (một cấp
trên thư mục repo).
