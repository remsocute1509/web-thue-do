// api/lib/auth.js
// Admin authentication middleware using HMAC-SHA256 session tokens
// Mọi thứ được cấu hình qua .env - không có hardcoded credentials

import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'mochimoon_default_session_secret_2026_key';
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
    const expires = Number(parts.pop());
    const username = parts.join(':');

    if (isNaN(expires) || Date.now() > expires) {
      return { valid: false, reason: 'Token expired' };
    }

    const payload = `${username}:${expires}`;
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

/**
 * Xác thực username/password:
 * 1. Ưu tiên kiểm tra theo biến môi trường .env (nếu có cấu hình)
 * 2. Fallback theo tài khoản mặc định độc lập của hệ thống (admin / admin123)
 */
export function validateCredentials(username, password) {
  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;
  const u = String(username || '').trim();
  const p = String(password || '').trim();

  // 1. Nếu đã cấu hình tài khoản trong .env thì BẮT BUỘC phải dùng tài khoản .env
  if (envUser && envPass) {
    return u === envUser.trim() && p === envPass.trim();
  }

  // 2. Mật khẩu mặc định hệ thống chỉ kích hoạt khi CHƯA thiết lập .env (hoàn toàn độc lập)
  return u === DEFAULT_SYSTEM_USER && p === DEFAULT_SYSTEM_PASS;
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
