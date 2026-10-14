// api/paid-list.js
// Danh sách đơn đã thanh toán - chỉ admin mới truy cập được
// Không còn public endpoint - bảo mật dữ liệu khách hàng

import { query } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Bảo vệ endpoint - chỉ admin mới xem được
  if (!requireAdmin(req, res)) return;

  try {
    const result = await query(
      `SELECT p.*, b.customer_name, b.email, b.phone, b.costume_name, b.rental_date
       FROM paid_orders p
       LEFT JOIN bookings b ON LOWER(b.order_id) = LOWER(p.order_id)
       ORDER BY p.paid_at DESC
       LIMIT 500`
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[paid-list]', err.message);
    return res.status(500).json({ error: 'Database error' });
  }
}
