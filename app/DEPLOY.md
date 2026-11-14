# Triển khai Chat Center lên VPS

Toàn bộ hệ thống chạy bằng Docker Compose trên **một máy chủ**: MongoDB, API
(NestJS), admin panel (Next.js) và Nginx lo HTTPS/WSS + cache bundle widget.

## 1. Yêu cầu

| Hạng mục | Tối thiểu | Ghi chú |
|---|---|---|
| VPS | 2 vCPU, 2 GB RAM, 20 GB SSD | Ubuntu 22.04/24.04 hoặc Debian 12 |
| Phần mềm | Docker Engine 24+ và Docker Compose v2 | `docker compose version` phải chạy được |
| DNS | 2 bản ghi A trỏ về IP máy chủ | `app.<domain>` và `api.<domain>` |
| Cổng mở | 80, 443 | 80 cần cho việc cấp chứng chỉ |

Hai hostname là **bắt buộc**, không phải lựa chọn: admin panel có route nội bộ
của riêng nó dưới `/api/*` (ví dụ `/api/ws-ticket`), nếu đi chung hostname với
backend thì Nginx sẽ chặn mất route đó.

## 2. Lấy mã nguồn và khai báo cấu hình

```bash
git clone <repo-url> /srv/chat-center
cd /srv/chat-center

cp .env.production.example .env.production
openssl rand -hex 32   # dán vào JWT_SECRET
openssl rand -hex 24   # dán vào MONGO_ROOT_PASSWORD
nano .env.production
```

Sửa đúng tên miền trong Nginx (file đang để chỗ trống bằng `APP_DOMAIN` /
`API_DOMAIN`):

```bash
sed -i 's/APP_DOMAIN/app.example.com/g; s/API_DOMAIN/api.example.com/g' docker/nginx.conf
```

Nhớ rằng `MONGODB_URI` phải khớp với `MONGO_ROOT_USERNAME` và
`MONGO_ROOT_PASSWORD` — đây là chỗ hay sai nhất khi deploy lần đầu.

## 3. Cấp chứng chỉ TLS lần đầu

Nginx không khởi động được khi chưa có file chứng chỉ, nên cấp chứng chỉ
**trước** khi dựng stack. Lúc này cổng 80 còn rảnh nên dùng chế độ `standalone`:

```bash
set -a; . ./.env.production; set +a

mkdir -p letsencrypt certbot-webroot backups

docker run --rm -p 80:80 \
  -v "$PWD/letsencrypt:/etc/letsencrypt" \
  certbot/certbot certonly --standalone \
  --cert-name "$APP_DOMAIN" \
  -d "$APP_DOMAIN" -d "$API_DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email
```

Một chứng chỉ chứa cả hai tên, đặt tại `letsencrypt/live/$APP_DOMAIN/` — đúng
đường dẫn mà `docker/nginx.conf` trỏ tới cho cả hai server block.

## 4. Dựng stack

```bash
docker compose --env-file .env.production up -d --build
docker compose ps
curl -fsS https://api.example.com/api/health
```

`/api/health` trả `{"status":"ok","db":true,...}` là API đã kết nối được
MongoDB. Nếu trả 503 thì xem log: `docker compose logs api --tail 50`.

Kiểm tra bundle widget đã được phục vụ:

```bash
curl -sI https://api.example.com/v1/widget.js | head -5
```

Phải thấy `content-type: text/javascript` và `cache-control: public, max-age=300`.

## 5. Tạo tài khoản quản trị đầu tiên

Mở `https://app.example.com/register`. Trang này **chỉ hoạt động khi hệ thống
chưa có tài khoản nào**: người đăng ký đầu tiên trở thành admin, và ngay sau đó
đăng ký công khai tự đóng lại — `POST /api/auth/register` trả 403
`REGISTRATION_CLOSED`, còn trang `/register` hiện thông báo thay vì cái form vô
dụng.

Nhân viên về sau do admin tạo trong *Quản trị & Phân tích → Quản lý người
dùng*. Tài khoản tạo theo cách đó được kích hoạt email ngay, nên bước này không
phụ thuộc SMTP.

Kiểm tra lại cho chắc sau khi đã có admin:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.example.com/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.com","name":"Probe","password":"probe-password"}'
# phải là 403
```

> Cánh cửa này mở lại nếu database trống trở lại — đó là chủ ý, để còn đường
> khôi phục khi mất hết tài khoản. Nhưng nghĩa là **một database rỗng lộ ra
> Internet có thể bị người lạ chiếm quyền admin**, nên đừng để stack chạy với
> database trắng lâu hơn mức cần thiết.

## 6. Tạo dự án và lấy mã nhúng

Mỗi website là một **dự án**: một key, một bộ cấu hình, một hàng đợi hội thoại.

1. Đăng nhập panel → **Kênh kết nối → Live Chat Widget**.
2. **Thêm site**: đặt tên, tiêu đề, màu, lời chào, và khai **origin được phép
   nhúng** (ví dụ `https://example.com` và `https://www.example.com`).
3. Copy đoạn mã, dán vào website ngay trước `</body>`:

```html
<script src="https://api.example.com/v1/widget.js" data-chat-center-key="pk_..." async></script>
```

Widget tự suy ra địa chỉ API từ chính `src` của nó, nên snippet không cần thêm
thuộc tính nào khác. Để trống danh sách origin nghĩa là **mọi website đều nhúng
được key đó** — tiện khi thử, nhưng phải khai domain thật trước khi chạy chính
thức.

Sau đó, trong chính trang dự án:

- **Người phụ trách dự án** — thêm nhân viên vào dự án. Người được thêm (quyền
  `manager`) xem và trả lời được hội thoại của đúng dự án đó, không thấy key,
  không sửa cấu hình, không thêm được người khác. Tài khoản phải tồn tại trước,
  tạo ở *Quản trị & Phân tích → Quản lý người dùng*.
- **Giờ làm việc** — khai múi giờ, ngày và giờ làm việc. Ngoài giờ, widget hiện
  lời nhắn đã cấu hình và xin email của khách. Khách vẫn gửi tin được mọi lúc;
  việc khai giờ chỉ để họ biết khi nào được trả lời.

## 7. Sao lưu định kỳ

```bash
sh docker/mongo-backup.sh          # chạy thử một lần
crontab -e
```

```cron
0 3 * * * cd /srv/chat-center && sh docker/mongo-backup.sh >> backups/backup.log 2>&1
```

Giữ 14 ngày (`KEEP_DAYS`). Script chỉ xóa bản cũ **sau khi** dump thành công,
nên một lần backup lỗi không làm mất bản tốt cuối cùng.

Phục hồi:

```bash
set -a; . ./.env.production; set +a
docker compose exec -T mongo mongorestore \
  --archive=/backups/chat_center-YYYYmmdd-HHMMSS.archive.gz --gzip --drop \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin
```

Hãy thử phục hồi vào một máy chủ khác **một lần** trước khi tin vào bản backup.

## 8. Gia hạn chứng chỉ

Khi Nginx đã chạy thì dùng `--webroot` (không phải chiếm cổng 80):

```cron
0 4 1 * * cd /srv/chat-center && docker compose --env-file .env.production run --rm certbot && docker compose exec -T nginx nginx -s reload
```

## 9. Cập nhật phiên bản

```bash
cd /srv/chat-center
git pull
docker compose --env-file .env.production up -d --build
```

Lưu ý: image `admin` nhúng sẵn `NEXT_PUBLIC_API_URL` vào lúc build, nên đổi
`PUBLIC_API_URL` thì phải build lại image đó (`--build`), không chỉ restart.

Quay lại bản cũ:

```bash
git checkout <commit-cũ>
docker compose --env-file .env.production up -d --build
```

Dữ liệu nằm trong volume `mongo-data` nên không bị ảnh hưởng khi rebuild. Trước
khi chạy một bản có thay đổi schema, hãy backup trước.

## 10. Chẩn đoán nhanh

| Hiện tượng | Kiểm tra |
|---|---|
| Hộp chat không hiện trên website | Mở DevTools → Console/Network. 403 ở `/api/widget/session` nghĩa là origin chưa được khai trong site. |
| `widget.js` trả 503 | Bundle chưa build vào image — rebuild `api` (`docker compose build api`). |
| Tin nhắn không realtime | Kiểm tra `/socket.io/` qua Nginx; xem tab Network có kết nối `websocket` ở trạng thái `101`. |
| Panel báo lỗi kết nối | `docker compose logs api --tail 100`; kiểm tra `CORS_ORIGINS` có đúng `https://app.<domain>`. |
| Không gửi được email xác thực | SMTP chưa cấu hình. Trong lúc chưa có SMTP, admin tạo tài khoản nhân viên trực tiếp (được kích hoạt sẵn). |
| Nhân viên không thấy hội thoại nào | Họ chưa được thêm vào dự án nào. Thêm ở trang dự án → *Người phụ trách dự án*. |
| Giới hạn số phiên chat theo IP chặn cả văn phòng | Kiểm tra `TRUST_PROXY=1`; nếu thiếu, mọi khách bị tính chung IP của nginx. |

Log: `docker compose logs -f api`, `... admin`, `... nginx`.

## 11. Checklist trước khi chạy thật

- [ ] `JWT_SECRET` và `MONGO_ROOT_PASSWORD` là chuỗi random, không phải giá trị mẫu
- [ ] Đã tạo admin đầu tiên, và `POST /api/auth/register` trả 403 (mục 5)
- [ ] Mỗi site đã khai `allowedOrigins` đúng domain thật
- [ ] Cron backup đã chạy và đã thử phục hồi một lần
- [ ] Cron gia hạn chứng chỉ đã đặt
- [ ] `TRUST_PROXY=1` (đứng sau nginx) để giới hạn theo IP tính đúng từng khách
- [ ] Firewall chỉ mở 22, 80, 443
- [ ] SMTP hoạt động (quên mật khẩu, xác thực email phụ thuộc vào nó)
- [ ] Có theo dõi uptime trỏ vào `https://api.<domain>/api/health`

Còn lại cho giai đoạn sau: **Redis adapter** khi chạy nhiều instance API —
hiện room socket, bộ đếm rate limit và trạng thái "có người trực" đều nằm trong
bộ nhớ của từng process, nên hai instance sẽ không thấy nhau. Cùng với đó là
gửi email cho nhân viên khi không ai online, upload ảnh/file, và phân trang
danh sách dự án.
