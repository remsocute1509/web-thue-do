// api/admin-approve.js
// Admin thủ công approve đơn thanh toán (thay thế simulate-payment)
// Yêu cầu admin auth token

import { query } from './lib/db.js';
import { requireAdmin } from './lib/auth.js';
import { sendPaymentNotification } from './lib/discord.js';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!requireAdmin(req, res)) return;

  const body = await parseBody(req);
  const { orderId, amount = 0, note = 'Admin manual approval' } = body || {};

  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  const cleanId = String(orderId).replace('#', '').trim().toUpperCase();
  const fullId  = `#${cleanId}`;

  try {
    await query(
      `INSERT INTO paid_orders (order_id, amount, content, gateway, paid_at)
       VALUES ($1, $2, $3, 'Manual', NOW())
       ON CONFLICT (order_id) DO UPDATE SET
         amount=EXCLUDED.amount, content=EXCLUDED.content, paid_at=NOW()`,
      [fullId, amount, note]
    );

    // Cập nhật trạng thái booking
    await query(
      `UPDATE bookings SET status='paid', updated_at=NOW()
       WHERE LOWER(REPLACE(order_id, '#', '')) = LOWER($1)`,
      [cleanId]
    );

    // Lấy thông tin khách hàng để gửi Discord
    const bookingRes = await query(
      `SELECT customer_name, email, phone FROM bookings
       WHERE LOWER(REPLACE(order_id, '#', '')) = LOWER($1) LIMIT 1`,
      [cleanId]
    );
    const customerInfo = bookingRes.rows[0] || {};

    await sendPaymentNotification({
      orderId: fullId,
      amount,
      content: note,
      gateway: 'Manual (Admin)',
      time: new Date().toISOString(),
      customerName: customerInfo.customer_name,
      email: customerInfo.email,
      phone: customerInfo.phone,
    });

    return res.status(200).json({ success: true, orderId: fullId });
  } catch (err) {
    console.error('[admin-approve]', err.message);
    return res.status(500).json({ error: 'Database error' });
  }
}
