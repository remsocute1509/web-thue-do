// api/admin-login.js
// Admin login endpoint - xác thực qua .env credentials
// Trả về HMAC-SHA256 session token

import { validateCredentials, createToken } from './_lib/auth.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await parseBody(req);
  const { username, password } = body || {};

  // Delay nhỏ để chống brute force timing attack
  await new Promise(r => setTimeout(r, 200 + Math.random() * 100));

  if (!validateCredentials(username, password)) {
    // Log cảnh báo nhưng không tiết lộ lý do cụ thể
    console.warn(`[AUTH] Failed login attempt for user: ${String(username || '').slice(0, 20)}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(username);
  console.log(`[AUTH] Admin login successful: ${username}`);

  return res.status(200).json({
    success: true,
    token,
    expiresIn: '8h'
  });
}
