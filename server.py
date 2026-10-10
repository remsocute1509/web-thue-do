import os
import re
import sys
import json
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
PAID_FILE = os.path.join(DATA_DIR, 'paid_orders.json')

def load_paid_orders():
    if os.path.exists(PAID_FILE):
        try:
            with open(PAID_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_paid_orders(data):
    try:
        with open(PAID_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Save error:", e)

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        # Check order payment status API
        if parsed.path == '/api/check-payment':
            params = urllib.parse.parse_qs(parsed.query)
            order_id = params.get('orderId', [''])[0].strip().replace('#', '')
            paid_orders = load_paid_orders()
            
            is_paid = False
            tx_info = None
            if order_id:
                for key, val in paid_orders.items():
                    k_clean = key.replace('#', '').lower()
                    target = order_id.lower()
                    if k_clean == target or target in k_clean or k_clean in target:
                        is_paid = True
                        tx_info = val
                        break

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                'orderId': order_id,
                'paid': is_paid,
                'transaction': tx_info
            }, ensure_ascii=False).encode('utf-8'))
            return

        elif parsed.path == '/api/paid-list':
            paid_orders = load_paid_orders()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(paid_orders, ensure_ascii=False).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        # 1. Real Bank Webhook: Supports SePay, Casso, PayOS & custom bank notification
        if parsed.path in ('/api/webhook/bank', '/api/webhook/sepay', '/api/webhook'):
            content_len = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(content_len)
            try:
                payload = json.loads(body_bytes.decode('utf-8'))
            except Exception:
                payload = {}

            print(f"[BANK WEBHOOK RECEIVED]: {payload}")

            content = str(payload.get('content', '') or payload.get('description', '') or payload.get('code', '') or '')
            amount = payload.get('amount') or payload.get('transferAmount') or 0
            gateway = payload.get('gateway') or payload.get('subAccount') or 'MBBank'
            
            match = re.search(r'MC[-_]?\d+', content, re.IGNORECASE)
            matched_order = match.group(0).upper().replace('_', '-') if match else ''
            if not matched_order and 'orderId' in payload:
                matched_order = str(payload['orderId']).upper().replace('_', '-')

            if matched_order:
                clean_key = matched_order.replace('#', '')
                paid_orders = load_paid_orders()
                paid_orders[clean_key] = {
                    'orderId': matched_order,
                    'amount': amount,
                    'content': content,
                    'gateway': gateway,
                    'time': str(payload.get('transactionDate') or payload.get('when') or 'Vừa xong')
                }
                save_paid_orders(paid_orders)
                print(f"[APPROVED ORDER VIA WEBHOOK]: {matched_order} - Amount: {amount}")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'matchedOrder': matched_order,
                'message': 'Webhook received successfully'
            }, ensure_ascii=False).encode('utf-8'))
            return

        # 2. Simulate Payment Endpoint (For testing & manual approval by owner)
        elif parsed.path == '/api/simulate-payment':
            content_len = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(content_len)
            try:
                payload = json.loads(body_bytes.decode('utf-8'))
            except Exception:
                payload = {}

            order_id = str(payload.get('orderId', '')).strip().replace('#', '')
            if order_id:
                paid_orders = load_paid_orders()
                paid_orders[order_id] = {
                    'orderId': f"#{order_id}" if not order_id.startswith('#') else order_id,
                    'amount': payload.get('amount', 200000),
                    'content': f"THUEDO {order_id}",
                    'gateway': 'MBBank (0377193835)',
                    'time': 'Vừa xong'
                }
                save_paid_orders(paid_orders)
                print(f"[SIMULATED BANK NOTIFICATION]: {order_id}")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'orderId': order_id,
                'message': 'Simulated bank notification registered'
            }, ensure_ascii=False).encode('utf-8'))
            return

        self.send_error(404, "Not Found")

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            return super().send_head()

        range_header = self.headers.get('Range')
        if not range_header:
            return super().send_head()

        match = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if not match:
            return super().send_head()

        size = os.path.getsize(path)
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else size - 1

        if start >= size or end >= size or start > end:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        length = end - start + 1
        self.send_response(206)
        ctype = self.guess_type(path)
        self.send_header("Content-Type", ctype)
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

    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))

class ByteLimitWrapper:
    def __init__(self, file_obj, max_bytes):
        self.file_obj = file_obj
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
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    server = ThreadingHTTPServer(('0.0.0.0', port), CustomHTTPRequestHandler)
    print(f"Serving HTTP on port {port} with Webhook & Auto-Approval API...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
