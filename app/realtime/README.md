# Chat Center Realtime

Dịch vụ riêng chỉ chạy Socket.IO và GET /health, mặc định cổng 3003. API REST vẫn ở3002; admin và widget lấy dữ liệu HTTP từ API nhưng kết nối socket tới realtime.

## Chạy local

1. MongoDB và Redis phải đang chạy (Redis private, không công khai Internet).
2. Điền .env theo .env.example: MONGODB_URI, JWT_SECRET phải giống API; REDIS_URL và REALTIME_CHANNEL cũng phải giống.
3. Trong app/api/.env: REDIS_URL=redis://127.0.0.1:6379 và PUBLIC_REALTIME_URL=http://localhost:3003.
4. Trong app/realtime: npm ci; npm run build; npm start.
5. Khởi động lại API. Admin mặc định kết nối localhost3003 (hoặc đặt PUBLIC_REALTIME_URL trong admin env), widget nhận realtimeUrl từ /widget/session.

## Ranh giới

Gateway được chuyển vào src/chat.gateway.ts. Build chuẩn bị src/shared từ các domain service/schema trong API, không copy REST controller. Một nguồn logic cho listAccessible/accessForSite, dữ liệu chat và JWT; không duy trì bản fork domain. Vì vậy build cần app/api/src cạnh app/realtime, nhưng bản dist + dependencies chạy độc lập, không cần API process để gửi tin qua socket.

API không import gateway. Redis pub/sub chuyển broadcast REST (phân công/đóng/mở/system message), grant/revoke tới socket process. Agent send/join/typing còn kiểm tra quyền DB để chặn thao tác ngay khi membership đã mất. Presence heartbeat mỗi3s, hết hạn10s; API đọc presence từ Redis. Redis gián đoạn có thể mất broadcast vì pub/sub không bền vững; client reconnect sẽ tải lại state từ API. Đây chưa phải event outbox hoặc delivery guarantee.

Hiện hỗ trợ **một realtime instance**. Rate-limit và room broadcast nội bộ vẫn theo process; chưa bật socket.io Redis adapter cho việc scale ngang. Không tăng replicas trước khi có adapter + distributed rate limit. Tắt/bật API không tắt realtime; cả hai dùng chung DB và secret.

## Deploy

Dockerfile: docker/realtime.Dockerfile; compose đã có redis/realtime. PUBLIC_REALTIME_URL phải là URL public HTTPS. Có thể dùng cùng domain API, nginx /socket.io/ được chuyển tới realtime3003. Redis không publish port trong compose. Nếu dùng Redis chung cho nhiều môi trường, đặt REALTIME_CHANNEL khác nhau. Giữ Redis ở private network có auth/TLS phù hợp. Chưa kiểm thử Docker production trong lần thay đổi này.
