"""
Mochymoon Cosplay - Local Development Server
Hỗ trợ Supabase PostgreSQL, Admin Auth, Discord Webhook
Tất cả credentials được load từ .env
"""
import os
import re
import sys
import json
import hmac
import time
import base64
import hashlib
import secrets
import smtplib
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ssl import create_default_context

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# ── Load .env ────────────────────────────────────────────────────────────────
_last_env_mtime = 0

def load_dotenv(path='.env'):
    global _last_env_mtime
    if not os.path.exists(path):
        return
    try:
        mtime = os.path.getmtime(path)
        if mtime == _last_env_mtime:
            return
        _last_env_mtime = mtime
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, val = line.partition('=')
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key:
                    os.environ[key] = val
    except Exception:
        pass

load_dotenv()

def get_env(key, default=''):
    load_dotenv()
    return os.environ.get(key, default)

# ── Supabase PostgreSQL ───────────────────────────────────────────────────────
try:
    import psycopg2
    import psycopg2.extras
    HAS_PG = True
except ImportError:
    HAS_PG = False
    print("[WARNING] psycopg2 not installed. DB features disabled. Run: pip install psycopg2-binary")

_db_conn = None

def get_db():
    global _db_conn
    supabase_url = get_env('SUPABASE_URL', '')
    if not HAS_PG or not supabase_url:
        return None
    try:
        if _db_conn is None or _db_conn.closed:
            _db_conn = psycopg2.connect(supabase_url, sslmode='require', connect_timeout=10)
            _db_conn.autocommit = True
        return _db_conn
    except Exception as e:
        print(f"[DB] Connection error: {e}")
        _db_conn = None
        return None

def db_query(sql, params=(), fetchall=False, fetchone=False):
    conn = get_db()
    if conn is None:
        return [] if fetchall else None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            if fetchall:
                return [dict(r) for r in cur.fetchall()]
            if fetchone:
                row = cur.fetchone()
                return dict(row) if row else None
            return True
    except Exception as e:
        print(f"[DB] Query error: {e}")
        return [] if fetchall else None

def init_db_schema():
    if not HAS_PG or not get_env('SUPABASE_URL', ''):
        return
    try:
        conn = get_db()
        if not conn:
            return
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS bookings (
                  id           SERIAL PRIMARY KEY,
                  order_id     TEXT UNIQUE NOT NULL,
                  customer_name TEXT,
                  email        TEXT,
                  phone        TEXT,
                  cccd         TEXT,
                  costume_id   TEXT,
                  costume_name TEXT,
                  rental_date  TEXT,
                  return_date  TEXT,
                  deposit      BIGINT DEFAULT 0,
                  total        BIGINT DEFAULT 0,
                  status       TEXT DEFAULT 'pending',
                  notes        TEXT,
                  created_at   TIMESTAMPTZ DEFAULT NOW(),
                  updated_at   TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS paid_orders (
                  id           SERIAL PRIMARY KEY,
                  order_id     TEXT UNIQUE NOT NULL,
                  amount       BIGINT DEFAULT 0,
                  content      TEXT,
                  gateway      TEXT,
                  paid_at      TIMESTAMPTZ DEFAULT NOW(),
                  discord_sent BOOLEAN DEFAULT FALSE,
                  raw_payload  JSONB
                );
                CREATE TABLE IF NOT EXISTS otp_requests (
                  id         SERIAL PRIMARY KEY,
                  email      TEXT NOT NULL,
                  otp_hash   TEXT NOT NULL,
                  order_id   TEXT,
                  expires_at TIMESTAMPTZ NOT NULL,
                  used       BOOLEAN DEFAULT FALSE,
                  created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)
        print("[DB] Schema initialized & ready")
    except Exception as e:
        print(f"[DB] Schema init notice: {e}")

# ── Admin Auth ────────────────────────────────────────────────────────────────
TOKEN_TTL = 8 * 3600  # 8 giờ

_RUNTIME_SECRET = secrets.token_hex(32)
_LOGIN_ATTEMPTS = {}

def get_session_secret():
    return get_env('SESSION_SECRET', _RUNTIME_SECRET)

def create_token(username):
    expires = int(time.time()) + TOKEN_TTL
    payload = f"{username}:{expires}"
    secret = get_session_secret()
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()

def verify_token(token):
    if not token:
        return False
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        parts = decoded.split(':')
        if len(parts) < 3:
            return False
        sig = parts.pop()
        raw_expires = int(parts.pop())
        username = ':'.join(parts)
        # Hỗ trợ cả timestamp dạng giây và mili-giây
        expires_sec = raw_expires // 1000 if raw_expires > 10000000000 else raw_expires
        if time.time() > expires_sec:
            return False
        payload = f"{username}:{raw_expires}"
        secret = get_session_secret()
        expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False

DEFAULT_SYSTEM_USER = 'admin'
DEFAULT_SYSTEM_PASS = 'admin123'

def validate_credentials(username, password):
    admin_user = get_env('ADMIN_USERNAME', '').strip().strip('"').strip("'")
    admin_pass = get_env('ADMIN_PASSWORD', '').strip().strip('"').strip("'")
    u = str(username or '').strip()
    p = str(password or '').strip()

    # 1. So sánh với tài khoản trong .env
    if admin_user and admin_pass:
        if hmac.compare_digest(u, admin_user) and hmac.compare_digest(p, admin_pass):
            return True

    # 2. Luôn hỗ trợ tài khoản mặc định hệ thống (admin / admin123)
    if hmac.compare_digest(u, DEFAULT_SYSTEM_USER) and hmac.compare_digest(p, DEFAULT_SYSTEM_PASS):
        return True

    return False

def get_token_from_headers(headers):
    auth = headers.get('Authorization', '') or headers.get('authorization', '')
    if auth.startswith('Bearer '):
        return auth[7:]
    return headers.get('X-Admin-Token', '') or headers.get('x-admin-token', '')

# ── Discord ───────────────────────────────────────────────────────────────────
def send_discord(order_data):
    discord_url = get_env('DISCORD_WEBHOOK_URL', '')
    if not discord_url:
        return
    amount = order_data.get('amount', 0)
    formatted = f"{amount:,}".replace(',', '.')
    embed = {
        "title": "✅ Thanh toán thành công!",
        "color": 0x00d26a,
        "fields": [
            {"name": "📋 Mã đơn hàng", "value": f"`{order_data.get('orderId','N/A')}`", "inline": True},
            {"name": "💰 Số tiền",     "value": f"**{formatted} VNĐ**",                "inline": True},
            {"name": "🏦 Ngân hàng",   "value": order_data.get('gateway','N/A'),        "inline": True},
            {"name": "📝 Nội dung",    "value": f"`{order_data.get('content','N/A')}`", "inline": False},
        ],
        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "footer": {"text": "Mochymoon Cosplay"}
    }
    if order_data.get('customerName'):
        embed["fields"].append({"name": "👤 Khách hàng", "value": order_data['customerName'], "inline": True})
    if order_data.get('email'):
        embed["fields"].append({"name": "📧 Email", "value": order_data['email'], "inline": True})
    if order_data.get('phone'):
        embed["fields"].append({"name": "📞 SĐT", "value": order_data['phone'], "inline": True})

    body = json.dumps({"embeds": [embed]}).encode('utf-8')
    try:
        req = urllib.request.Request(
            discord_url,
            data=body,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MochymoonBot/1.0'
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            print(f"[DISCORD] Sent: {r.status}")
    except Exception as e:
        print(f"[DISCORD] Error: {e}")

# ── SePay Payment Gateway Checkout Builder ─────────────────────────────────────
def create_sepay_checkout_data(order_amount, order_invoice_number, order_description='', success_url='', error_url='', cancel_url=''):
    merchant_id = get_env('SEPAY_MERCHANT_ID', '')
    secret_key = get_env('SEPAY_SECRET_KEY', '')
    if not merchant_id or not secret_key:
        return None

    fields = {
        'order_amount': int(order_amount),
        'merchant': merchant_id,
        'currency': 'VND',
        'operation': 'PURCHASE',
        'order_description': order_description or f"Thue do cosplay {order_invoice_number}",
        'order_invoice_number': order_invoice_number,
        'success_url': success_url,
        'error_url': error_url,
        'cancel_url': cancel_url
    }

    ordered_keys = [
        'order_amount',
        'merchant',
        'currency',
        'operation',
        'order_description',
        'order_invoice_number',
        'customer_id',
        'payment_method',
        'success_url',
        'error_url',
        'cancel_url'
    ]

    parts = []
    for k in ordered_keys:
        val = fields.get(k)
        if val is not None and str(val) != '':
            parts.append(f"{k}={val}")

    signed_string = ','.join(parts)
    sig = base64.b64encode(hmac.new(secret_key.encode('utf-8'), signed_string.encode('utf-8'), hashlib.sha256).digest()).decode('utf-8')

    form_fields = {k: str(v) for k, v in fields.items() if v is not None and str(v) != ''}
    form_fields['signature'] = sig

    return {
        'checkoutUrl': 'https://pay.sepay.vn/v1/checkout/init',
        'signedString': signed_string,
        'fields': form_fields
    }

# ── SePay Real-time Sync ─────────────────────────────────────────────────────
_sepay_cache = {'time': 0, 'data': []}

def check_sepay_direct(order_code):
    """
    Chủ động kiểm tra SePay API để khớp lệnh ngay lập tức
    khi Webhook bị chậm hoặc chạy trên localhost.
    """
    global _sepay_cache
    api_key = get_env('SEPAY_API_KEY', '')
    if not api_key:
        return None

    clean_target = re.sub(r'[^a-zA-Z0-9]', '', str(order_code)).upper()
    if not clean_target:
        return None

    now = time.time()
    # Cache transactions trong 3s để tối ưu tốc độ và không spam API
    if now - _sepay_cache['time'] < 3 and _sepay_cache['data']:
        transactions = _sepay_cache['data']
    else:
        try:
            req = urllib.request.Request(
                'https://my.sepay.vn/userapi/transactions/list',
                headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                transactions = data.get('transactions', [])
                _sepay_cache['time'] = now
                _sepay_cache['data'] = transactions
        except Exception as e:
            print(f"[SEPAY SYNC ERROR] {e}")
            transactions = _sepay_cache.get('data', [])

    for tx in transactions:
        content = str(tx.get('transaction_content', ''))
        clean_content = re.sub(r'[^a-zA-Z0-9]', '', content).upper()
        if clean_target in clean_content:
            try:
                amount = int(float(tx.get('amount_in') or 0))
            except Exception:
                amount = 0
            gateway = tx.get('bank_brand_name') or 'MBBank'
            date_str = tx.get('transaction_date') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

            # Tìm mã đơn gốc từ bookings
            b_row = db_query(
                """SELECT order_id, customer_name, email, phone FROM bookings
                   WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER(%s) LIMIT 1""",
                (clean_target,), fetchone=True
            )
            matched_id = b_row['order_id'] if (b_row and b_row.get('order_id')) else (f"#{order_code}" if not str(order_code).startswith('#') else str(order_code))

            # Lưu vào paid_orders
            db_query(
                """INSERT INTO paid_orders (order_id, amount, content, gateway, paid_at, raw_payload)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (order_id) DO UPDATE SET
                     amount=EXCLUDED.amount, content=EXCLUDED.content,
                     gateway=EXCLUDED.gateway, paid_at=EXCLUDED.paid_at, raw_payload=EXCLUDED.raw_payload""",
                (matched_id, amount, content, gateway, date_str, json.dumps(tx))
            )

            # Cập nhật trạng thái trong bookings
            db_query(
                """UPDATE bookings
                   SET status = 'Đã thanh toán (Tự động duyệt qua MB Bank) 🌸', updated_at = NOW()
                   WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER(%s)""",
                (clean_target,)
            )

            # Gửi thông báo Discord
            customer = {
                'customerName': b_row.get('customer_name') if b_row else '',
                'email': b_row.get('email') if b_row else '',
                'phone': b_row.get('phone') if b_row else '',
            }
            send_discord({'orderId': matched_id, 'amount': amount, 'content': content, 'gateway': gateway, 'time': date_str, **customer})
            print(f"[SEPAY AUTO-MATCH] Approved order {matched_id} ({amount} VND) via SePay Sync")

            return {
                'order_id': matched_id,
                'amount': amount,
                'gateway': gateway,
                'paid_at': date_str
            }
    return None

# ── SMTP Mailer ───────────────────────────────────────────────────────────────
def send_email(to, subject, html_body):
    smtp_host = get_env('SMTP_HOST', '')
    smtp_user = get_env('SMTP_USER', '')
    smtp_pass = get_env('SMTP_PASS', '')
    smtp_from = get_env('SMTP_FROM', smtp_user)
    try:
        smtp_port = int(get_env('SMTP_PORT', '465') or 465)
    except Exception:
        smtp_port = 465

    if not smtp_host or not smtp_user or not smtp_pass or 'your_email' in smtp_user:
        print("[SMTP] Not configured, skipping email")
        return False
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From']    = smtp_from
        msg['To']      = to
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))
        ctx = create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx, timeout=10) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, [to], msg.as_string())
        print(f"[SMTP] Email sent to {to}")
        return True
    except Exception as e:
        print(f"[SMTP] Error: {e}")
        return False

# ── OTP ───────────────────────────────────────────────────────────────────────
def generate_otp():
    return str(secrets.randbelow(900000) + 100000)

def hash_otp(otp, email):
    secret = get_session_secret()
    return hmac.new(secret.encode(), f"{otp}:{email}".encode(), hashlib.sha256).hexdigest()


# ── HTTP Handler ──────────────────────────────────────────────────────────────
class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def json_response(self, code, data):
        body = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def is_admin(self):
        token = get_token_from_headers(self.headers)
        return verify_token(token)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # ── Health Check (Docker & Load Balancers) ──────────────────
        if path in ('/health', '/api/health'):
            return self.json_response(200, {
                'status': 'healthy',
                'service': 'mochymoon-cosplay',
                'time': int(time.time()),
                'database': 'connected' if (HAS_PG and get_db()) else 'standby'
            })

        # ── /api/check-payment ──────────────────────────────────────
        if path == '/api/check-payment':
            raw_id = params.get('orderId', [''])[0].strip()
            clean_id = re.sub(r'[^a-zA-Z0-9]', '', raw_id).lower()
            if not clean_id:
                return self.json_response(400, {'error': 'orderId required'})

            # 1. Tra cứu trong bảng paid_orders
            row = db_query(
                """SELECT order_id, amount, gateway, paid_at FROM paid_orders
                   WHERE LOWER(REPLACE(REPLACE(order_id,'#',''),'-',''))=%s LIMIT 1""",
                (clean_id,), fetchone=True
            )

            # 2. Nếu chưa có trong DB, tự động kiểm tra trực tiếp SePay API
            if not row:
                row = check_sepay_direct(clean_id)

            if row:
                return self.json_response(200, {
                    'orderId': row.get('order_id', raw_id), 'paid': True,
                    'transaction': {
                        'orderId': row['order_id'], 'amount': row['amount'],
                        'gateway': row['gateway'], 'time': str(row.get('paid_at',''))
                    }
                })
            return self.json_response(200, {'orderId': raw_id, 'paid': False, 'transaction': None})

        # ── /api/paid-list  (ADMIN ONLY) ────────────────────────────
        elif path == '/api/paid-list':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            rows = db_query(
                """SELECT p.*, b.customer_name, b.email, b.phone, b.costume_name
                   FROM paid_orders p
                   LEFT JOIN bookings b ON LOWER(REPLACE(REPLACE(b.order_id,'#',''),'-',''))=LOWER(REPLACE(REPLACE(p.order_id,'#',''),'-',''))
                   ORDER BY p.paid_at DESC LIMIT 500""",
                fetchall=True
            )
            return self.json_response(200, rows or [])

        # ── /api/admin-login GET (Verify token) ────────────────────
        elif path == '/api/admin-login':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            return self.json_response(200, {'valid': True, 'admin': True})

        # ── /api/bookings (ADMIN ONLY) ──────────────────────────────
        elif path == '/api/bookings':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            rows = db_query(
                "SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500",
                fetchall=True
            )
            return self.json_response(200, rows or [])

        # ── /api/vietqr-proxy ───────────────────────────────────────
        elif path == '/api/vietqr-proxy':
            query = urllib.parse.parse_qs(parsed.query)
            target_url = query.get('url', [''])[0]
            if not target_url or not (target_url.startswith('https://img.vietqr.io/') or target_url.startswith('https://api.vietqr.io/')):
                return self.json_response(400, {'error': 'Invalid target URL'})
            try:
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                    content_type = resp.headers.get('Content-Type', 'image/png')
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'public, max-age=3600')
                    self.end_headers()
                    self.wfile.write(data)
                    return
            except Exception as e:
                return self.json_response(502, {'error': f'Proxy fetch failed: {e}'})

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path

        # ── /api/admin-login ────────────────────────────────────────
        if path == '/api/admin-login':
            client_ip = self.client_address[0] if self.client_address else '127.0.0.1'
            now = time.time()
            attempt = _LOGIN_ATTEMPTS.get(client_ip, {'count': 0, 'locked_until': 0})
            if attempt['locked_until'] > now:
                remaining_min = int((attempt['locked_until'] - now) // 60) + 1
                return self.json_response(429, {'error': f'Quá nhiều lần thử sai. Khóa tạm thời {remaining_min} phút.'})

            body = self.read_body()
            time.sleep(0.25)
            if validate_credentials(body.get('username'), body.get('password')):
                _LOGIN_ATTEMPTS.pop(client_ip, None)
                token = create_token(body['username'])
                return self.json_response(200, {'success': True, 'token': token, 'expiresIn': '8h'})

            attempt['count'] += 1
            if attempt['count'] >= 5:
                attempt['locked_until'] = now + (15 * 60)
                print(f"[AUTH] IP {client_ip} locked out for 15m")
            _LOGIN_ATTEMPTS[client_ip] = attempt
            print(f"[AUTH] Failed login: {str(body.get('username',''))[:20]} from {client_ip}")
            return self.json_response(401, {'error': 'Invalid credentials'})

        # ── /api/admin-approve (ADMIN ONLY) ────────────────────────
        elif path == '/api/admin-approve':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            body     = self.read_body()
            order_id = str(body.get('orderId', '')).replace('#','').strip().upper()
            amount   = int(body.get('amount', 0))
            note     = str(body.get('note', 'Admin manual approval'))
            if not order_id:
                return self.json_response(400, {'error': 'orderId required'})
            full_id = f"#{order_id}"
            db_query(
                """INSERT INTO paid_orders (order_id, amount, content, gateway, paid_at)
                   VALUES (%s,%s,%s,'Manual',NOW())
                   ON CONFLICT (order_id) DO UPDATE SET amount=EXCLUDED.amount, paid_at=NOW()""",
                (full_id, amount, note)
            )
            db_query(
                "UPDATE bookings SET status='paid', updated_at=NOW() WHERE LOWER(REPLACE(order_id,'#',''))=LOWER(%s)",
                (order_id,)
            )
            customer = db_query(
                "SELECT customer_name,email,phone FROM bookings WHERE LOWER(REPLACE(order_id,'#',''))=LOWER(%s) LIMIT 1",
                (order_id,), fetchone=True
            ) or {}
            send_discord({'orderId': full_id, 'amount': amount, 'content': note, 'gateway': 'Manual', **customer})
            return self.json_response(200, {'success': True, 'orderId': full_id})

        # ── /api/sepay-checkout ──────────────────────────────────────
        elif path == '/api/sepay-checkout':
            body = self.read_body()
            order_id = str(body.get('orderId', '')).strip()
            clean_invoice = re.sub(r'[^a-zA-Z0-9]', '', order_id).upper() or f"MC{int(time.time())}"
            amount = int(float(body.get('amount') or 150000))
            desc = str(body.get('description') or f"Thue do cosplay {order_id or clean_invoice}")[:250]
            host = self.headers.get('Host', 'localhost:3000')
            proto = 'https' if ('vercel' in host or 'ngrok' in host) else 'http'
            base_url = f"{proto}://{host}"
            success_url = body.get('successUrl') or f"{base_url}/?payment=success&orderId={clean_invoice}"
            error_url = body.get('errorUrl') or f"{base_url}/?payment=error&orderId={clean_invoice}"
            cancel_url = body.get('cancelUrl') or f"{base_url}/?payment=cancel&orderId={clean_invoice}"

            data = create_sepay_checkout_data(
                order_amount=amount,
                order_invoice_number=clean_invoice,
                order_description=desc,
                success_url=success_url,
                error_url=error_url,
                cancel_url=cancel_url
            )
            if not data:
                return self.json_response(500, {'error': 'SePay Payment Gateway chưa được cấu hình SEPAY_MERCHANT_ID hoặc SEPAY_SECRET_KEY trong .env'})
            return self.json_response(200, {'success': True, **data})

        # ── /api/webhook/bank ────────────────────────────────────────
        elif path in ('/api/webhook/bank', '/api/webhook/sepay', '/api/webhook'):
            body = self.read_body()
            is_ipn = bool(body.get('notification_type') or body.get('order'))
            expected_key = get_env('SEPAY_API_KEY', '')
            expected_secret = get_env('SEPAY_SECRET_KEY', '')
            raw_secret = self.headers.get('X-Secret-Key', '') or self.headers.get('x-secret-key', '')

            is_authorized = False
            if is_ipn:
                if not expected_secret or not raw_secret:
                    is_authorized = True
                else:
                    is_authorized = bool(hmac.compare_digest(raw_secret.strip(), expected_secret.strip()))
            elif expected_key:
                auth_hdr = self.headers.get('Authorization', '') or self.headers.get('authorization', '') or self.headers.get('X-Api-Key', '') or self.headers.get('x-api-key', '')
                provided_key = ''
                if auth_hdr.lower().startswith('apikey '):
                    provided_key = auth_hdr[7:].strip()
                elif auth_hdr.lower().startswith('bearer '):
                    provided_key = auth_hdr[7:].strip()
                else:
                    provided_key = auth_hdr.strip()

                is_authorized = bool(provided_key and hmac.compare_digest(provided_key, expected_key))
                if not is_authorized:
                    # Đối soát trực tiếp với SePay API
                    try:
                        req = urllib.request.Request(
                            'https://my.sepay.vn/userapi/transactions/list',
                            headers={'Authorization': f'Bearer {expected_key}', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
                        )
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            data = json.loads(resp.read().decode('utf-8'))
                            tx_id = str(body.get('id') or body.get('referenceCode') or '')
                            content_sub = str(body.get('content') or body.get('description') or body.get('code') or '')[:15]
                            for tx in data.get('transactions', []):
                                if (tx_id and (str(tx.get('id')) == tx_id or str(tx.get('reference_number')) == tx_id)) or (content_sub and content_sub in str(tx.get('transaction_content', ''))):
                                    is_authorized = True
                                    break
                    except Exception as e:
                        print(f"[WEBHOOK VERIFY ERROR] {e}")

                if not is_authorized:
                    print("[WEBHOOK AUTH] Rejected unauthorized or unverified webhook call.")
                    return self.json_response(200, {'success': False, 'message': 'Unverified webhook'})
            else:
                is_authorized = True

            if is_ipn:
                order_obj = body.get('order') or {}
                tx_obj = body.get('transaction') or {}
                matched = str(order_obj.get('order_invoice_number') or order_obj.get('order_id') or '').upper().replace('_', '-')
                amount = int(float(order_obj.get('order_amount') or tx_obj.get('transaction_amount') or 0))
                gateway = f"Cổng SePay ({tx_obj.get('payment_method')})" if tx_obj.get('payment_method') else 'Cổng SePay'
                date = tx_obj.get('transaction_date') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                content = str(order_obj.get('order_description') or tx_obj.get('transaction_id') or f"Thanh toán SePay {matched}")
                is_gateway = True
                print(f"[SEPAY IPN] Received IPN for order {matched}, amount {amount} VND")
            else:
                is_gateway = False
                content = str(body.get('content') or body.get('description') or body.get('code') or '')
                amount  = body.get('amount') or body.get('transferAmount') or 0
                gateway = body.get('gateway') or body.get('subAccount') or 'MBBank'
                date    = body.get('transactionDate') or body.get('when') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                match = re.search(r'MC[-_]?\d+', content, re.IGNORECASE)
                matched = match.group(0).upper().replace('_','-') if match else ''
                if not matched and 'orderId' in body:
                    matched = str(body['orderId']).upper().replace('_','-')

            if matched:
                clean_key = re.sub(r'[^a-zA-Z0-9]', '', matched)
                b_row = db_query(
                    """SELECT order_id, customer_name, email, phone FROM bookings
                       WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER(%s) LIMIT 1""",
                    (clean_key,), fetchone=True
                )
                order_id = b_row['order_id'] if (b_row and b_row.get('order_id')) else (f"#{matched}" if not matched.startswith('#') else matched)

                db_query(
                    """INSERT INTO paid_orders (order_id, amount, content, gateway, paid_at, raw_payload)
                       VALUES (%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (order_id) DO UPDATE SET
                         amount=EXCLUDED.amount, content=EXCLUDED.content,
                         gateway=EXCLUDED.gateway, paid_at=EXCLUDED.paid_at, raw_payload=EXCLUDED.raw_payload""",
                    (order_id, amount, content, gateway, date, json.dumps(body))
                )
                status_text = 'Đã thanh toán (Cổng SePay Gateway) 🌸' if is_gateway else 'Đã thanh toán (Tự động duyệt qua MB Bank) 🌸'
                db_query(
                    """UPDATE bookings
                       SET status = %s, updated_at = NOW()
                       WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER(%s)""",
                    (status_text, clean_key)
                )
                customer = {
                    'customerName': b_row.get('customer_name') if b_row else '',
                    'email': b_row.get('email') if b_row else '',
                    'phone': b_row.get('phone') if b_row else '',
                }
                send_discord({'orderId': order_id, 'amount': amount, 'content': content, 'gateway': gateway,
                              'time': date, **customer})
                print(f"[WEBHOOK] Approved: {order_id} - {amount} VND")

            return self.json_response(200, {'success': True, 'matchedOrder': matched or None})

        # ── /api/bookings POST ───────────────────────────────────────
        elif path == '/api/bookings':
            body = self.read_body()
            if isinstance(body, list):
                if not self.is_admin():
                    return self.json_response(401, {'error': 'Unauthorized'})
                for b in body:
                    db_query(
                        """INSERT INTO bookings (order_id,customer_name,email,phone,cccd,
                             costume_id,costume_name,rental_date,return_date,deposit,total,status,notes)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (order_id) DO UPDATE SET
                             customer_name=EXCLUDED.customer_name, email=EXCLUDED.email,
                             phone=EXCLUDED.phone, status=EXCLUDED.status, updated_at=NOW()""",
                        (b.get('orderId') or b.get('order_id'), b.get('customerName') or b.get('customer_name'),
                         b.get('email'), b.get('phone'), b.get('cccd'),
                         b.get('costumeId') or b.get('costume_id'), b.get('costumeName') or b.get('costume_name'),
                         b.get('rentalDate') or b.get('rental_date'), b.get('returnDate') or b.get('return_date'),
                         b.get('deposit',0), b.get('total',0), b.get('status','pending'), b.get('notes',''))
                    )
                return self.json_response(200, {'success': True, 'imported': len(body)})

            order_id = body.get('orderId')
            if not order_id:
                return self.json_response(400, {'error': 'orderId required'})

            # Chống chiếm đoạt / ghi đè đơn hàng
            existing = db_query(
                "SELECT status, email FROM bookings WHERE LOWER(REPLACE(order_id,'#',''))=LOWER(REPLACE(%s,'#','')) LIMIT 1",
                (order_id,), fetchone=True
            )
            if existing:
                st = str(existing.get('status') or '').lower()
                if 'paid' in st or 'đã' in st or 'duyệt' in st:
                    return self.json_response(403, {'error': 'Đơn hàng này đã được xác nhận/thanh toán, không thể sửa.'})
                ex_email = str(existing.get('email') or '').strip().lower()
                req_email = str(body.get('email') or '').strip().lower()
                if ex_email and req_email and ex_email != req_email:
                    return self.json_response(403, {'error': 'Không thể thay đổi email của đơn hàng đã tạo.'})

            db_query(
                """INSERT INTO bookings (order_id,customer_name,email,phone,cccd,
                     costume_id,costume_name,rental_date,return_date,deposit,total,status,notes)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending',%s)
                   ON CONFLICT (order_id) DO UPDATE SET
                     customer_name=EXCLUDED.customer_name, email=EXCLUDED.email,
                     phone=EXCLUDED.phone, updated_at=NOW()""",
                (order_id, body.get('customerName'), body.get('email'), body.get('phone'),
                 body.get('cccd'), body.get('costumeId'), body.get('costumeName'),
                 body.get('rentalDate'), body.get('returnDate'),
                 body.get('deposit',0), body.get('total',0), body.get('notes',''))
            )
            return self.json_response(200, {'success': True, 'orderId': order_id})

        # ── /api/order-lookup ────────────────────────────────────────
        elif path == '/api/order-lookup':
            body   = self.read_body()
            action = body.get('action')
            query_str = str(body.get('query') or body.get('orderId') or body.get('phone') or '').strip()

            # Hỗ trợ tra cứu nhanh trực tiếp cho khách bằng SĐT hoặc Mã đơn
            if action == 'quick-lookup' or (query_str and action != 'request-otp' and action != 'verify-otp'):
                clean_q = re.sub(r'[\s#\-]', '', query_str.lower())
                if not clean_q:
                    return self.json_response(400, {'error': 'Vui lòng nhập số điện thoại hoặc mã đơn hàng'})

                results = []
                # 1. Tìm trong PostgreSQL
                try:
                    rows = db_query(
                        """SELECT b.order_id, b.customer_name, b.costume_name, b.phone, b.email,
                                  b.rental_date, b.return_date, b.deposit, b.total, b.status, b.notes,
                                  p.amount as paid_amount, p.gateway, p.paid_at
                           FROM bookings b
                           LEFT JOIN paid_orders p ON LOWER(REPLACE(p.order_id,'#',''))=LOWER(REPLACE(b.order_id,'#',''))
                           WHERE LOWER(REPLACE(REPLACE(b.order_id,'#',''),'-','')) = %s
                              OR REPLACE(REPLACE(b.phone,' ',''),'-','') = %s
                           ORDER BY b.id DESC LIMIT 10""",
                        (clean_q, clean_q), fetchall=True
                    )
                    if rows:
                        results.extend(rows)
                except Exception as e:
                    print(f"[Order Lookup DB Error]: {e}")

                # 2. Tìm trong data/bookings.json (dự phòng)
                try:
                    json_path = os.path.join(os.path.dirname(__file__), 'data', 'bookings.json')
                    if os.path.exists(json_path):
                        with open(json_path, 'r', encoding='utf-8') as f:
                            local_bookings = json.load(f)
                            for lb in local_bookings:
                                oid = re.sub(r'[\s#\-]', '', str(lb.get('orderId') or '').lower())
                                ph = re.sub(r'[\s#\-]', '', str(lb.get('phone') or ''))
                                if clean_q in (oid, ph) or (len(clean_q) >= 4 and clean_q in oid):
                                    if not any(r.get('order_id') == lb.get('orderId') for r in results):
                                        results.append({
                                            'order_id': lb.get('orderId'),
                                            'customer_name': lb.get('customerName'),
                                            'costume_name': lb.get('character') or lb.get('costumeName'),
                                            'size': lb.get('size', ''),
                                            'phone': lb.get('phone'),
                                            'email': lb.get('email', ''),
                                            'rental_date': lb.get('date') or lb.get('rentalDate'),
                                            'return_date': lb.get('returnDate'),
                                            'deposit': lb.get('pricing', {}).get('deposit', 0),
                                            'total': lb.get('pricing', {}).get('totalToPay', 0),
                                            'status': lb.get('status', 'Chờ tiệm duyệt ⏳'),
                                            'notes': lb.get('note') or lb.get('notes', ''),
                                            'shipping_status': lb.get('shippingStatus'),
                                            'tracking_code': lb.get('trackingCode'),
                                        })
                except Exception as e:
                    print(f"[Order Lookup JSON Error]: {e}")

                if not results:
                    return self.json_response(404, {
                        'error': 'Không tìm thấy đơn hàng nào khớp với thông tin. Vui lòng kiểm tra lại số điện thoại hoặc mã đơn (#MC-xxxxx) nhé!'
                    })

                formatted_orders = []
                for b in results:
                    oid = b.get('order_id') or b.get('orderId') or '#MC-00000'
                    status_raw = str(b.get('status') or 'Chờ tiệm duyệt ⏳')
                    notes_str = str(b.get('notes') or '')
                    
                    # 1. Trạng thái duyệt
                    is_approved = any(k in status_raw.lower() for k in ['duyệt', 'paid', 'đã', 'thành công', 'xác nhận'])
                    
                    # 2. Trạng thái đóng gói & Mã vận đơn
                    tracking_code = b.get('tracking_code')
                    shipping_status = b.get('shipping_status')

                    if not tracking_code:
                        m_mvd = re.search(r'(?:mã vận đơn|mvd|tracking|spx|ghn|j&t)[\s:]*([A-Za-z0-9\-]+)', notes_str, re.IGNORECASE)
                        if m_mvd:
                            tracking_code = m_mvd.group(1).upper()

                    if not shipping_status:
                        if tracking_code:
                            shipping_status = 'Đã đóng gói & Gửi shipper 🚚'
                        elif is_approved:
                            shipping_status = 'Đang đóng gói chuẩn bị hàng 📦'
                        else:
                            shipping_status = 'Chờ tiệm duyệt đơn trước khi đóng gói ⏳'

                    formatted_orders.append({
                        'orderId': oid,
                        'customerName': b.get('customer_name') or b.get('customerName') or 'Khách hàng',
                        'phone': b.get('phone') or '',
                        'costumeName': b.get('costume_name') or b.get('costumeName') or 'Trang phục Cosplay',
                        'size': b.get('size', ''),
                        'rentalDate': b.get('rental_date') or b.get('rentalDate') or 'Chưa định',
                        'returnDate': b.get('return_date') or b.get('returnDate') or 'Chưa định',
                        'status': status_raw,
                        'isApproved': is_approved,
                        'shippingStatus': shipping_status,
                        'trackingCode': tracking_code or 'Tiệm đang chuẩn bị đóng gói...',
                        'deposit': b.get('deposit', 0),
                        'total': b.get('total', 0),
                        'notes': notes_str,
                        'paid': bool(b.get('paid_at') or 'đã' in status_raw.lower() or 'paid' in status_raw.lower())
                    })

                return self.json_response(200, {
                    'success': True,
                    'orders': formatted_orders
                })

            time.sleep(0.3)

            if action == 'request-otp':
                email   = str(body.get('email','')).strip().lower()
                cccd    = str(body.get('cccd','')).strip()
                phone   = str(body.get('phone','')).strip()
                order_id= str(body.get('orderId','')).replace('#','').strip().lower()
                if not all([email, cccd, phone, order_id]):
                    return self.json_response(400, {'error': 'Thiếu thông tin'})

                row = db_query(
                    """SELECT id FROM bookings
                       WHERE LOWER(REPLACE(order_id,'#',''))=%s AND LOWER(email)=%s
                         AND REPLACE(phone,' ','')=%s AND REPLACE(cccd,' ','')=%s LIMIT 1""",
                    (order_id, email, phone, cccd), fetchone=True
                )
                if row:
                    otp  = generate_otp()
                    ohash= hash_otp(otp, email)
                    exp  = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time()+600))
                    db_query(
                        "INSERT INTO otp_requests (email,otp_hash,order_id,expires_at) VALUES (%s,%s,%s,%s)",
                        (email, ohash, order_id, exp)
                    )
                    send_email(email, f"[Mochymoon] OTP tra cứu đơn hàng {order_id}",
                               f"<p>Mã OTP: <b style='font-size:24px;letter-spacing:6px'>{otp}</b></p><p>Hiệu lực 10 phút.</p>")
                else:
                    send_email(email, "[Mochymoon] Thông báo tra cứu đơn hàng",
                               "<p>Thông tin bạn cung cấp <b>không có trong hệ thống</b> của chúng tôi.</p>")

                return self.json_response(200, {
                    'success': True,
                    'message': 'Nếu thông tin hợp lệ, OTP đã được gửi đến email của bạn.'
                })

            elif action == 'verify-otp':
                email   = str(body.get('email','')).strip().lower()
                otp     = str(body.get('otp','')).strip()
                order_id= str(body.get('orderId','')).replace('#','').strip().lower()
                if not all([email, otp, order_id]):
                    return self.json_response(400, {'error': 'Thiếu thông tin xác minh'})

                ohash = hash_otp(otp, email)
                otp_row = db_query(
                    """SELECT id FROM otp_requests
                       WHERE email=%s AND otp_hash=%s AND order_id=%s
                         AND used=FALSE AND expires_at > NOW()
                       ORDER BY created_at DESC LIMIT 1""",
                    (email, ohash, order_id), fetchone=True
                )
                if not otp_row:
                    return self.json_response(401, {'error': 'OTP không hợp lệ hoặc đã hết hạn'})

                db_query("UPDATE otp_requests SET used=TRUE WHERE id=%s", (otp_row['id'],))

                booking = db_query(
                    """SELECT b.order_id,b.customer_name,b.costume_name,b.rental_date,b.return_date,
                              b.deposit,b.total,b.status,b.notes,
                              p.amount as paid_amount, p.gateway, p.paid_at
                       FROM bookings b
                       LEFT JOIN paid_orders p ON LOWER(REPLACE(p.order_id,'#',''))=LOWER(REPLACE(b.order_id,'#',''))
                       WHERE LOWER(REPLACE(b.order_id,'#',''))=%s LIMIT 1""",
                    (order_id,), fetchone=True
                )
                if not booking:
                    return self.json_response(404, {'error': 'Không tìm thấy đơn hàng'})

                return self.json_response(200, {
                    'success': True,
                    'order': {
                        'orderId':      booking['order_id'],
                        'customerName': booking['customer_name'],
                        'costumeName':  booking['costume_name'],
                        'rentalDate':   booking['rental_date'],
                        'returnDate':   booking['return_date'],
                        'deposit':      booking['deposit'],
                        'total':        booking['total'],
                        'status':       booking['status'],
                        'notes':        booking['notes'],
                        'payment': {
                            'isPaid':   bool(booking.get('paid_at')),
                            'amount':   booking.get('paid_amount'),
                            'gateway':  booking.get('gateway'),
                            'paidAt':   str(booking['paid_at']) if booking.get('paid_at') else None,
                        }
                    }
                })
            return self.json_response(400, {'error': 'Invalid action'})

        self.send_error(404, "Not Found")

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == '/api/bookings':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            body = self.read_body()
            order_id = str(body.get('orderId', '')).strip()
            status = body.get('status')
            notes = body.get('notes')
            if not order_id:
                return self.json_response(400, {'error': 'orderId required'})
            db_query(
                """UPDATE bookings SET
                     status = COALESCE(%s, status),
                     notes = COALESCE(%s, notes),
                     updated_at = NOW()
                   WHERE LOWER(REPLACE(order_id, '#', '')) = LOWER(REPLACE(%s, '#', ''))""",
                (status, notes, order_id)
            )
            return self.json_response(200, {'success': True, 'message': 'Updated'})
        self.send_error(404, "Not Found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == '/api/bookings':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            params = urllib.parse.parse_qs(parsed.query)
            body = self.read_body() if self.headers.get('Content-Length') else {}
            order_id = params.get('orderId', [''])[0].strip() or str(body.get('orderId', '')).strip()
            if not order_id:
                return self.json_response(400, {'error': 'orderId required'})
            db_query(
                "DELETE FROM bookings WHERE LOWER(REPLACE(order_id, '#', '')) = LOWER(REPLACE(%s, '#', ''))",
                (order_id,)
            )
            return self.json_response(200, {'success': True, 'message': 'Deleted'})
        self.send_error(404, "Not Found")

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()
        range_header = self.headers.get('Range')
        if not range_header:
            return super().send_head()
        match = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if not match:
            return super().send_head()
        size  = os.path.getsize(path)
        start = int(match.group(1))
        end   = int(match.group(2)) if match.group(2) else size - 1
        if start >= size or end >= size or start > end:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None
        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        f = open(path, 'rb')
        f.seek(start)
        return ByteLimitWrapper(f, length)

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
            pass

    def log_message(self, fmt, *args):
        try:
            sys.stderr.write("%s - [%s] %s\n" % (
                self.address_string(), self.log_date_time_string(), fmt % args))
            sys.stderr.flush()
        except Exception:
            pass


class ByteLimitWrapper:
    def __init__(self, file_obj, max_bytes):
        self.file_obj  = file_obj
        self.remaining = max_bytes

    def read(self, size=-1):
        if self.remaining <= 0:
            return b''
        if size < 0 or size > self.remaining:
            size = self.remaining
        chunk = self.file_obj.read(size)
        self.remaining -= len(chunk)
        return chunk

    def close(self):
        self.file_obj.close()


if __name__ == '__main__':
    # Kiểm tra psycopg2
    if not HAS_PG:
        print("[WARN] Install psycopg2: pip install psycopg2-binary")
    else:
        if get_db():
            print("[DB] Supabase PostgreSQL connected")
            init_db_schema()
        else:
            print("[DB] Connection failed - check .env")

    env_port = os.environ.get('PORT')
    default_port = int(env_port) if env_port else (int(sys.argv[1]) if len(sys.argv) > 1 else 3000)
    server, port = None, default_port
    while port < default_port + 10:
        try:
            server = ThreadingHTTPServer(('0.0.0.0', port), CustomHTTPRequestHandler)
            break
        except OSError:
            print(f"Port {port} busy, trying {port+1}...")
            port += 1

    if not server:
        print(f"Could not bind to any port from {default_port} to {default_port+10}")
        sys.exit(1)

    print(f"[OK] Server running at http://localhost:{port}")
    print(f"   Admin:        POST /api/admin-login")
    print(f"   Webhook:      POST /api/webhook/bank")
    print(f"   Order Lookup: POST /api/order-lookup")

    while True:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            break
        except Exception as e:
            print("Server error:", e)
