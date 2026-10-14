// api/webhook/bank.js
// SePay Webhook handler
// Nhận thông báo thanh toán -> lưu Supabase -> gửi Discord

import crypto from 'crypto';
import { query } from '../_lib/db.js';
import { sendPaymentNotification } from '../_lib/discord.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) {}
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(200).json({ success: true, message: 'SePay Webhook endpoint ready' });
  }

  // 1. Xác thực Webhook từ SePay (chống giả mạo thanh toán)
  const expectedApiKey = process.env.SEPAY_API_KEY || '';
  if (expectedApiKey) {
    const rawAuth = req.headers['authorization'] || req.headers['x-api-key'] || req.headers['x-sepay-key'] || '';
    let providedKey = '';
    if (rawAuth.toLowerCase().startsWith('apikey ')) {
      providedKey = rawAuth.slice(7).trim();
    } else if (rawAuth.toLowerCase().startsWith('bearer ')) {
      providedKey = rawAuth.slice(7).trim();
    } else {
      providedKey = rawAuth.trim();
    }

    const expectedBuf = Buffer.from(expectedApiKey);
    const providedBuf = Buffer.from(providedKey);
    const isValid = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!isValid) {
      console.warn('[WEBHOOK AUTH] Rejected unauthorized webhook call. Invalid API Key.');
      return res.status(401).json({ error: 'Unauthorized: Invalid SePay API Key' });
    }
  }

  try {
    const payload = await parseBody(req);
    console.log('[SEPAY WEBHOOK]:', JSON.stringify(payload));

    const content = String(payload.content || payload.description || payload.code || '');
    const amount  = payload.transferAmount || payload.amount || 0;
    const gateway = payload.gateway || payload.subAccount || 'MBBank';
    const date    = payload.transactionDate || payload.when || new Date().toISOString();

    // Tìm mã đơn hàng từ nội dung chuyển khoản (MC29138 hoặc MC-29138)
    const match = content.match(/MC[-_]?\d+/i);
    let matchedOrder = match ? match[0].toUpperCase().replace('_', '-') : '';
    if (!matchedOrder && payload.orderId) {
      matchedOrder = String(payload.orderId).toUpperCase().replace('_', '-');
    }

    if (matchedOrder) {
      const orderId = matchedOrder.startsWith('#') ? matchedOrder : `#${matchedOrder}`;
      const orderKey = matchedOrder.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      // Lưu vào Supabase
      await query(
        `INSERT INTO paid_orders (order_id, amount, content, gateway, paid_at, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (order_id) DO UPDATE SET
           amount=EXCLUDED.amount, content=EXCLUDED.content,
           gateway=EXCLUDED.gateway, paid_at=EXCLUDED.paid_at,
           raw_payload=EXCLUDED.raw_payload`,
        [orderId, amount, content, gateway, date, JSON.stringify(payload)]
      );

      // Lấy thông tin khách hàng từ bookings để bổ sung Discord embed
      let customerInfo = {};
      try {
        const bookingRes = await query(
          `SELECT customer_name, email, phone FROM bookings
           WHERE LOWER(REPLACE(order_id, '#', '')) = LOWER($1) LIMIT 1`,
          [orderKey]
        );
        if (bookingRes.rows.length > 0) {
          customerInfo = bookingRes.rows[0];
        }
      } catch (e) { /* bỏ qua nếu không tìm thấy */ }

      // Gửi Discord notification
      const discordSent = await sendPaymentNotification({
        orderId,
        amount,
        content,
        gateway,
        time: date,
        customerName: customerInfo.customer_name,
        email: customerInfo.email,
        phone: customerInfo.phone,
      });

      // Đánh dấu discord_sent
      if (discordSent) {
        await query(
          `UPDATE paid_orders SET discord_sent=TRUE WHERE order_id=$1`,
          [orderId]
        );
      }

      console.log(`[ORDER APPROVED]: ${orderId} - ${amount}đ`);
    }

    return res.status(200).json({
      success: true,
      matchedOrder: matchedOrder || null,
      message: 'Webhook processed successfully'
    });
  } catch (err) {
    console.error('[Webhook error]:', err.message);
    // Luôn trả 200 để SePay không retry liên tục
    return res.status(200).json({ success: true, message: 'Error handled gracefully' });
  }
}
