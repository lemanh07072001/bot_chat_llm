# Ảnh Site lưu trong dự án

Upload mặc định lưu file tại app/api/uploads/site-images (khi chạy API từ app/api). Đổi vị trí bằng SITE_IMAGE_DIR; có thể dùng đường dẫn tuyệt đối. PUBLIC_API_URL phải là URL API mà trình duyệt truy cập được; ví dụ http://localhost:3002/api.

POST /api/site-images yêu cầu admin đã xác thực, giới hạn 10 lần/phút theo tài khoản. PNG/JPEG/WebP được trình duyệt thu nhỏ, kiểm tra dung lượng và chữ ký trước khi ghi file tên UUID. GET /api/site-images/:filename là URL công khai dùng cho logo widget. Thư mục upload không commit vào Git.

Sao lưu thư mục upload cùng MongoDB. Khi deploy Docker, mount volume bền vững vào SITE_IMAGE_DIR; nếu nhiều API instance phải dùng filesystem dùng chung hoặc chuyển sang R2. Xóa ảnh khỏi form chỉ bỏ liên kết, không xóa file. Upload rồi hủy form có thể để lại file không còn tham chiếu.

R2 service/cấu hình vẫn giữ để tích hợp sau, nhưng endpoint upload hiện dùng local kể cả đã điền R2. Ảnh cũ và URL ảnh ngoài không tự migrate.
