# 🌸 Mochymoon Cosplay - Nền Tảng Cho Thuê Trang Phục Cosplay

Hệ thống website cho thuê đồ cosplay chuyên nghiệp: hỗ trợ tra cứu đơn hàng, thanh toán tự động qua SePay (MB Bank), thông báo Discord Webhook và lưu trữ dữ liệu đồng bộ Supabase PostgreSQL.

---

## 🚀 Hướng Dẫn Chạy Bằng Docker

### 1. Chuẩn bị file `.env`
Sao chép từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
Điền các thông tin:
- `SUPABASE_URL`: Chuỗi kết nối PostgreSQL (Session mode port 5432)
- `SEPAY_API_KEY`: API Key SePay để khớp lệnh chuyển khoản ngân hàng
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: Tài khoản quản trị viên
- `DISCORD_WEBHOOK_URL`: (Tùy chọn) Bắn thông báo khi có đơn hàng/thanh toán
- `SMTP_*`: (Tùy chọn) Gửi OTP & email xác nhận đơn

### 2. Chạy nhanh bằng Docker Compose (Khuyên dùng)
```bash
docker compose up -d --build
```
Kiểm tra log:
```bash
docker compose logs -f
```
Dừng container:
```bash
docker compose down
```

### 3. Hoặc Build & Chạy bằng Docker thủ công
```bash
# Build image
docker build -t mochymoon-cosplay .

# Chạy container với file .env
docker run -d --name mochymoon-app -p 3000:3000 --env-file .env mochymoon-cosplay
```

Sau khi chạy, truy cập ứng dụng tại: `http://localhost:3000`

---

## 💻 Chạy Trực Tiếp Không Dùng Docker

### Yêu Cầu:
- Python 3.10+
- Thư viện: `pip install -r requirements.txt`

### Khởi chạy:
```bash
python server.py 3000
```
Hoặc qua npm:
```bash
npm start
```

---

## 🛠️ API & Endpoint Sức Khỏe
- `GET /health` hoặc `GET /api/health`: Healthcheck endpoint cho Docker & Cloud load balancers
- `GET /api/check-payment?orderId=...`: Kiểm tra trạng thái thanh toán & đối soát SePay
- `POST /api/webhook/bank`: Webhook nhận biến động số dư SePay MB Bank
- `POST /api/admin-login`: Đăng nhập bảng điều khiển Admin
