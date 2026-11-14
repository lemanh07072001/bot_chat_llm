# Ảnh Site trên Cloudflare R2

1. Tạo bucket R2.
2. Tạo R2 API token Object Read & Write, giới hạn vào đúng bucket. Giữ Access Key ID và Secret Access Key ở backend.
3. Cấu hình custom domain công khai (khuyến nghị production), hoặc bật public r2.dev URL để phát triển.
4. Điền vào file .env của API:

```dotenv
R2_ACCOUNT_ID=<Cloudflare account ID>
R2_ACCESS_KEY_ID=<R2 access key ID>
R2_SECRET_ACCESS_KEY=<R2 secret access key>
R2_BUCKET=<bucket name>
R2_PUBLIC_BASE_URL=https://images.example.com
```

5. Khởi động lại API. Mở Live Chat Widget → Thêm/chỉnh sửa Site → Chọn ảnh. Không gửi khóa bí mật qua chat hay đặt trong biến NEXT_PUBLIC_.

Ảnh được trình duyệt thu nhỏ tối đa 160px, chuyển WebP và tải qua same-origin admin proxy tới API. API kiểm tra quyền admin, hạn mức, base64/kích thước/chữ ký raster trước khi PUT bằng AWS S3 SDK tới R2. Không upload trực tiếp từ browser nên không cần CORS R2 cho upload. Cấu hình Site chỉ lưu URL công khai; URL nhập tay vẫn hỗ trợ.

Site cũ có data URL không bị migrate tự động; chọn lại ảnh rồi lưu để chuyển ảnh sang R2. Không tự động tải lên dữ liệu cũ.

Xóa ảnh trong form chỉ bỏ URL khỏi Site, không xóa object R2. Upload rồi hủy form cũng có thể tạo object không còn tham chiếu. Chưa có job dọn tự động; không đặt lifecycle xóa theo tuổi cho toàn bộ site-images/ vì sẽ xóa logo đang dùng. Cần kiểm tra tham chiếu trước khi dọn.
