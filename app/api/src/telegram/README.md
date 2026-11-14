# Telegram hai chiều

Trong **Live Chat Widget → chọn dự án → Telegram**, cấu hình một bot và một
supergroup riêng cho dự án. Có thể dùng cùng bot cho nhiều nhóm trong **cùng
một môi trường Chat Center**. Không chạy bot này đồng thời với ứng dụng khác,
local/VPS khác hoặc webhook: worker nhận tin bằng `getUpdates`.

## Chuẩn bị

1. Tạo bot qua BotFather. Bật Topics trong supergroup của dự án.
2. Thêm bot làm administrator, bật quyền Manage Topics.
3. Ở API, đặt `TELEGRAM_ENCRYPTION_KEY` là chuỗi hex ngẫu nhiên 64 ký tự.
   Không dùng biến `NEXT_PUBLIC_*`. Giữ khóa ổn định, backup riêng cùng kế
   hoạch khôi phục database. Nếu mất khóa phải nhập lại bot token.
4. Nhập bot token, group ID dạng `-100…`, các Telegram **user ID dạng số** và
   tài khoản Chat Center tương ứng. Tài khoản phải có quyền với dự án.
5. Lưu rồi bấm **Gửi thử cấu hình đã lưu**. Bật Telegram sau khi xác nhận đúng
   nhóm. Việc bật sẽ chuyển nội dung chat cho dịch vụ Telegram; cần thông báo
   phù hợp cho người sử dụng.

Không tự xóa webhook hiện có; cấu hình sẽ báo lỗi nếu bot có webhook khác.
Bot token mã hóa AES-256-GCM trong collection riêng, không có trong API đọc
site/widget và không trả về UI. Quyền đọc/sửa/test yêu cầu admin **sở hữu dự án**.

## Quy tắc trả lời

- Mỗi hội thoại có topic riêng; tên có ID hội thoại để phân biệt khách trùng tên.
- Dùng **Reply trực tiếp vào tin do bot chuyển từ Chat Center**. Nhóm + bot +
  revision cấu hình + ID tin + topic phải khớp liên kết lưu trong database.
- Tin thường, Reply tin đồng nghiệp/bot khác, admin ẩn danh, người ngoài danh
  sách, người bị thu hồi quyền, dự án bảo trì/xóa hoặc hội thoại đã đóng đều
  **không gửi về khách**. Hiện các trường hợp này bỏ qua, chưa gửi cảnh báo riêng.
- Tài khoản liên kết được kiểm tra quyền mỗi lần; không tự nhận hay đổi người
  phụ trách hội thoại. Tên người gửi trong lịch sử có hậu tố `· Telegram`.
- Chỉ hỗ trợ văn bản tối đa 4.000 UTF-16 code units. Không chuyển file/ảnh,
  tin chỉnh sửa, system message hay internal notes. Không đồng bộ xóa/sửa tin.
- Tin nhân viên từ web cũng được chuyển vào topic; tin nhận từ Telegram không
  bị echo trở lại. Những người trong nhóm tự thấy tin Reply của nhân viên.

## Worker và độ tin cậy

API đọc message đã lưu, có cursor bền vững, xử lý mỗi 2 giây, tối đa 10 tin/
dự án/lượt. Không chặn gửi chat khi Telegram lỗi. Giao diện hiển thị lỗi lần
gần nhất khi mở lại tab. `TELEGRAM_WORKER_ENABLED=false` dừng worker.

MongoDB lease chọn một worker giữa các API replica chung database. Worker
chạy ở API, không chạy trong realtime. Offset Telegram lưu theo bot. Tin Reply
dùng external ID unique để Telegram phát lại không tạo thêm message.

Lần đầu cấu hình hoặc đổi bot/nhóm chỉ chuyển tin mới; không xuất lịch sử.
Tắt/bật cùng cấu hình tiếp tục cursor và có thể chuyển backlog trong thời gian
tắt. Cấu hình cũ bị vô hiệu hóa liên kết khi đổi bot/nhóm; Reply tin nhóm cũ
không đến khách nữa.

**Không cam kết exactly-once phía gửi sang Telegram:** nếu Telegram đã nhận
nhưng kết nối timeout hoặc worker chết trước khi lưu ID phản hồi, lần thử lại
có thể tạo tin/topic trùng. ID hội thoại vẫn xác định đúng khách; không tự gửi
sang nhóm khác khi lỗi. Telegram chỉ giữ updates tối đa 24 giờ. Backup hiện
có chứa cấu hình mã hóa, link, topic và offset; cần khóa để khôi phục.

## Kiểm thử

`npm test` kiểm tra với Telegram client giả lập; không tự gửi dữ liệu khách ra
Telegram. Kiểm thử thực tế cần bot/group do quản trị cung cấp:

1. Tạo hai dự án và hai nhóm Topics; bật cấu hình cho mỗi dự án.
2. Hai khách cùng tên nhắn đồng thời; phải vào hai topic riêng đúng nhóm.
3. Reply khách A; chỉ widget A nhận, inbox lưu đúng người trả lời.
4. Tin thường/Reply sai topic/người không cấp quyền không xuất hiện ở widget.
5. Thu hồi quyền dự án rồi Reply lại; không gửi. Thử đóng hội thoại/bảo trì.
6. Restart API, nhắn tiếp: topic/cursor không mất. Mô phỏng Telegram lỗi rồi
   khôi phục, theo dõi backlog và khả năng trùng tin outbound nêu trên.
