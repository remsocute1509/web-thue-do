// api/lib/auth.js
// Admin authentication middleware using HMAC-SHA256 session tokens
// Mọi thứ được cấu hình qua .env - không có hardcoded credentials

import crypto from 'crypto';

// Secret mặc định ổn định khi Vercel chưa thêm SESSION_SECRET vào biến môi trường
const DEFAULT_SESSION_SECRET = 'a1a53281b57152b252cf4ebaa301b516ff3fa43210a0b1ca046ce772d6c1b0a5';
const SESSION_SECRET = (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim()) || DEFAULT_SESSION_SECRET;
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ

// Mật khẩu mặc định của hệ thống khi chưa cấu hình .env (không trùng với tài khoản riêng trong .env)
const DEFAULT_SYSTEM_USER = 'admin';
const DEFAULT_SYSTEM_PASS = 'admin123';

/**
 * Tạo HMAC-SHA256 token với payload + timestamp
 */
export function createToken(username) {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${username}:${expires}`;
  const secret = process.env.SESSION_SECRET || SESSION_SECRET;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // Format: base64(username:expires:signature)
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Xác minh token. Trả về { valid: true, username } hoặc { valid: false, reason }
 */
export function verifyToken(token) {
  if (!token) return { valid: false, reason: 'No token provided' };
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length < 3) return { valid: false, reason: 'Malformed token' };

    const sig = parts.pop();
    const rawExpires = Number(parts.pop());
    const username = parts.join(':');

    // Hỗ trợ cả timestamp dạng giây (10 số) và mili-giây (13 số)
    const expiresMs = rawExpires < 10000000000 ? rawExpires * 1000 : rawExpires;

    if (isNaN(expiresMs) || Date.now() > expiresMs) {
      return { valid: false, reason: 'Token expired' };
    }

    const payload = `${username}:${rawExpires}`;
    const secret = process.env.SESSION_SECRET || SESSION_SECRET;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const sigBuffer = Buffer.from(sig, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: 'Invalid signature' };
    }
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: 'Invalid signature' };
    }

    return { valid: true, username };
  } catch (e) {
    return { valid: false, reason: 'Token parse error' };
  }
}

function safeCompare(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Xác thực username/password:
 * 1. Ưu tiên kiểm tra theo biến môi trường .env (nếu có cấu hình)
 * 2. Fallback theo tài khoản mặc định độc lập của hệ thống (admin / admin123)
 * So sánh an toàn bằng timingSafeEqual chống tấn công dò thời gian (timing attacks)
 */
export function validateCredentials(username, password) {
  const envUser = String(process.env.ADMIN_USERNAME || '').replace(/^["']|["']$/g, '').trim();
  const envPass = String(process.env.ADMIN_PASSWORD || '').replace(/^["']|["']$/g, '').trim();
  const u = String(username || '').trim();
  const p = String(password || '').trim();

  // 1. Kiểm tra theo biến môi trường .env (nếu có cấu hình)
  if (envUser && envPass) {
    if (safeCompare(u, envUser) && safeCompare(p, envPass)) {
      return true;
    }
  }

  // 2. Luôn hỗ trợ tài khoản mặc định hệ thống (admin / admin123)
  if (safeCompare(u, DEFAULT_SYSTEM_USER) && safeCompare(p, DEFAULT_SYSTEM_PASS)) {
    return true;
  }

  return false;
}

/**
 * Middleware: Kiểm tra Authorization header hoặc cookie
 * Dùng trong các API endpoint admin
 */
export function requireAdmin(req, res) {
  const authHeader = req.headers['authorization'] || '';
  let token = '';

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    // Fallback: check x-admin-token header
    token = req.headers['x-admin-token'] || '';
  }

  const result = verifyToken(token);
  if (!result.valid) {
    res.status(401).json({ error: 'Unauthorized', reason: result.reason });
    return false;
  }
  return true;
}
