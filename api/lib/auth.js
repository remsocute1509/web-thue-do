// api/lib/auth.js
// Admin authentication middleware using HMAC-SHA256 session tokens
// Mọi thứ được cấu hình qua .env - không có hardcoded credentials

import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.warn('[AUTH] WARNING: SESSION_SECRET is too short or missing. Set a strong secret in .env');
}

/**
 * Tạo HMAC-SHA256 token với payload + timestamp
 */
export function createToken(username) {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${username}:${expires}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
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
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

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
 * Xác thực username/password từ .env (timing-safe comparison)
 */
export function validateCredentials(username, password) {
  const envUser = process.env.ADMIN_USERNAME || '';
  const envPass = process.env.ADMIN_PASSWORD || '';
  if (!envUser || !envPass) {
    console.error('[AUTH] ADMIN_USERNAME or ADMIN_PASSWORD not set in .env');
    return false;
  }
  const uBuf = Buffer.from(String(username || ''));
  const euBuf = Buffer.from(envUser);
  const pBuf = Buffer.from(String(password || ''));
  const epBuf = Buffer.from(envPass);

  if (uBuf.length !== euBuf.length || pBuf.length !== epBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(uBuf, euBuf) && crypto.timingSafeEqual(pBuf, epBuf);
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
