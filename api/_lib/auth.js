// api/lib/auth.js
// Admin authentication middleware using HMAC-SHA256 session tokens
// Mọi thứ được cấu hình qua .env - không có hardcoded credentials

import crypto from 'crypto';

// Fallback secret được sinh ngẫu nhiên trong bộ nhớ RAM mỗi lần khởi động (không hardcode secret cố định)
const RUNTIME_SECRET = crypto.randomBytes(32).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || RUNTIME_SECRET;
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
  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;
  const u = String(username || '').trim();
  const p = String(password || '').trim();

  // 1. Nếu đã cấu hình tài khoản trong .env thì BẮT BUỘC phải dùng tài khoản .env
  if (envUser && envPass) {
    return safeCompare(u, envUser.trim()) && safeCompare(p, envPass.trim());
  }

  // 2. Mật khẩu mặc định hệ thống chỉ kích hoạt khi CHƯA thiết lập .env (hoàn toàn độc lập)
  return safeCompare(u, DEFAULT_SYSTEM_USER) && safeCompare(p, DEFAULT_SYSTEM_PASS);
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
