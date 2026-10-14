// api/check-payment.js
// Kiểm tra trạng thái thanh toán - Public (không lộ dữ liệu cá nhân)
// Chỉ trả về trạng thái paid/unpaid + thông tin giao dịch cơ bản

import { query } from './lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const orderId = String(req.query.orderId || '').trim().replace('#', '');
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  try {
    // Tìm trong paid_orders bằng case-insensitive
    const result = await query(
      `SELECT order_id, amount, gateway, paid_at
       FROM paid_orders
       WHERE LOWER(REPLACE(order_id, '#', '')) = LOWER($1)
       LIMIT 1`,
      [orderId]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return res.status(200).json({
        orderId: orderId,
        paid: true,
        transaction: {
          orderId: row.order_id,
          amount: row.amount,
          gateway: row.gateway,
          time: row.paid_at,
        }
      });
    }

    return res.status(200).json({ orderId, paid: false, transaction: null });
  } catch (err) {
    console.error('[check-payment]', err.message);
    return res.status(500).json({ error: 'Database error' });
  }
}
