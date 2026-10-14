// api/admin-login.js
// Admin login endpoint - xác thực qua .env credentials
// Trả về HMAC-SHA256 session token

import { validateCredentials, createToken, requireAdmin } from './_lib/auth.js';

// In-memory sliding window rate limiter per client IP
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 phút

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.socket?.remoteAddress || '127.0.0.1';
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) {}
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: Kiểm tra tính hợp lệ của token admin hiện tại (xác thực từ server)
  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return res.status(200).json({ valid: true, admin: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  const attemptInfo = loginAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };

  // Kiểm tra lockout chống brute-force
  if (attemptInfo.lockedUntil > now) {
    const remainingMinutes = Math.ceil((attemptInfo.lockedUntil - now) / 60000);
    return res.status(429).json({
      error: `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${remainingMinutes} phút.`
    });
  }

  const body = await parseBody(req);
  const { username, password } = body || {};

  // Timing delay
  await new Promise(r => setTimeout(r, 200 + Math.random() * 100));

  if (!validateCredentials(username, password)) {
    attemptInfo.count += 1;
    if (attemptInfo.count >= MAX_FAILED_ATTEMPTS) {
      attemptInfo.lockedUntil = now + LOCKOUT_MS;
      console.warn(`[AUTH] IP ${clientIp} locked out due to ${attemptInfo.count} failed attempts.`);
    }
    loginAttempts.set(clientIp, attemptInfo);

    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - attemptInfo.count);
    return res.status(401).json({
      error: 'Invalid credentials',
      remainingAttempts: remaining > 0 ? remaining : 0
    });
  }

  // Đăng nhập thành công -> xóa bỏ bộ đếm lỗi
  loginAttempts.delete(clientIp);

  const token = createToken(username);
  console.log(`[AUTH] Admin login successful: ${username} from ${clientIp}`);

  return res.status(200).json({
    success: true,
    token,
    expiresIn: '8h'
  });
}
