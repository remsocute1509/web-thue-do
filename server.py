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

# ── Admin Auth ────────────────────────────────────────────────────────────────
TOKEN_TTL = 8 * 3600  # 8 giờ

def get_session_secret():
    return get_env('SESSION_SECRET', 'MochymoonSecretKey_Pl3ase_Change_Th1s_Now_2026!')

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
        expires = int(parts.pop())
        username = ':'.join(parts)
        if time.time() > expires:
            return False
        payload = f"{username}:{expires}"
        secret = get_session_secret()
        expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False

DEFAULT_SYSTEM_USER = 'admin'
DEFAULT_SYSTEM_PASS = 'admin123'

def validate_credentials(username, password):
    admin_user = get_env('ADMIN_USERNAME', '')
    admin_pass = get_env('ADMIN_PASSWORD', '')
    u = str(username or '').strip()
    p = str(password or '').strip()

    # 1. Ưu tiên kiểm tra tài khoản cấu hình trong .env
    if admin_user and admin_pass:
        return (u == admin_user) and (p == admin_pass)

    # 2. Mật khẩu mặc định hệ thống khi chưa thiết lập .env (hoàn toàn tách biệt)
    return (u == DEFAULT_SYSTEM_USER) and (p == DEFAULT_SYSTEM_PASS)

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
        req = urllib.request.Request(discord_url, data=body,
                                     headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=5) as r:
            print(f"[DISCORD] Sent: {r.status}")
    except Exception as e:
        print(f"[DISCORD] Error: {e}")

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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

        # ── /api/check-payment ──────────────────────────────────────
        if path == '/api/check-payment':
            order_id = params.get('orderId', [''])[0].strip().replace('#', '')
            if not order_id:
                return self.json_response(400, {'error': 'orderId required'})

            row = db_query(
                """SELECT order_id, amount, gateway, paid_at FROM paid_orders
                   WHERE LOWER(REPLACE(order_id,'#',''))=LOWER(%s) LIMIT 1""",
                (order_id,), fetchone=True
            )
            if row:
                return self.json_response(200, {
                    'orderId': order_id, 'paid': True,
                    'transaction': {
                        'orderId': row['order_id'], 'amount': row['amount'],
                        'gateway': row['gateway'], 'time': str(row.get('paid_at',''))
                    }
                })
            return self.json_response(200, {'orderId': order_id, 'paid': False, 'transaction': None})

        # ── /api/paid-list  (ADMIN ONLY) ────────────────────────────
        elif path == '/api/paid-list':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            rows = db_query(
                """SELECT p.*, b.customer_name, b.email, b.phone, b.costume_name
                   FROM paid_orders p
                   LEFT JOIN bookings b ON LOWER(REPLACE(b.order_id,'#',''))=LOWER(REPLACE(p.order_id,'#',''))
                   ORDER BY p.paid_at DESC LIMIT 500""",
                fetchall=True
            )
            return self.json_response(200, rows or [])

        # ── /api/bookings (ADMIN ONLY) ──────────────────────────────
        elif path == '/api/bookings':
            if not self.is_admin():
                return self.json_response(401, {'error': 'Unauthorized'})
            rows = db_query(
                "SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500",
                fetchall=True
            )
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
            body = self.read_body()
            time.sleep(0.25)
            if validate_credentials(body.get('username'), body.get('password')):
                token = create_token(body['username'])
                return self.json_response(200, {'success': True, 'token': token, 'expiresIn': '8h'})
            print(f"[AUTH] Failed login: {str(body.get('username',''))[:20]}")
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

        # ── /api/webhook/bank ────────────────────────────────────────
        elif path in ('/api/webhook/bank', '/api/webhook/sepay', '/api/webhook'):
            body    = self.read_body()
            content = str(body.get('content') or body.get('description') or body.get('code') or '')
            amount  = body.get('amount') or body.get('transferAmount') or 0
            gateway = body.get('gateway') or body.get('subAccount') or 'MBBank'
            date    = body.get('transactionDate') or body.get('when') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

            match = re.search(r'MC[-_]?\d+', content, re.IGNORECASE)
            matched = match.group(0).upper().replace('_','-') if match else ''
            if not matched and 'orderId' in body:
                matched = str(body['orderId']).upper().replace('_','-')

            if matched:
                order_id = f"#{matched}" if not matched.startswith('#') else matched
                db_query(
                    """INSERT INTO paid_orders (order_id, amount, content, gateway, paid_at, raw_payload)
                       VALUES (%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (order_id) DO UPDATE SET
                         amount=EXCLUDED.amount, content=EXCLUDED.content, paid_at=EXCLUDED.paid_at""",
                    (order_id, amount, content, gateway, date, json.dumps(body))
                )
                clean_key = matched.replace('#','')
                customer = db_query(
                    "SELECT customer_name,email,phone FROM bookings WHERE LOWER(REPLACE(order_id,'#',''))=LOWER(%s) LIMIT 1",
                    (clean_key,), fetchone=True
                ) or {}
                send_discord({'orderId': order_id, 'amount': amount, 'content': content, 'gateway': gateway,
                              'time': date, **customer})
                print(f"[WEBHOOK] Approved: {order_id} - {amount}đ")

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
        print("[DB] Supabase PostgreSQL connected" if get_db() else "[DB] Connection failed - check .env")

    default_port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
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
