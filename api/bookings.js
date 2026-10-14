// api/bookings.js
// Quản lý danh sách đơn thuê - Supabase PostgreSQL
// GET: chỉ admin mới xem được toàn bộ danh sách
// POST: khách hàng gửi đơn thuê mới

import { query } from './lib/db.js';
import { requireAdmin } from './lib/auth.js';

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

  // GET - Chỉ admin mới được xem danh sách đơn thuê
  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;

    try {
      const result = await query(
        `SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500`
      );
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error('[bookings GET]', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // POST - Khách hàng đặt đơn thuê mới
  if (req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      if (!payload) return res.status(400).json({ error: 'Invalid request body' });

      // Nếu payload là array thì đây là bulk import từ admin (cần auth)
      if (Array.isArray(payload)) {
        if (!requireAdmin(req, res)) return;
        // Bulk upsert (dùng khi migrate dữ liệu cũ)
        for (const booking of payload) {
          await query(
            `INSERT INTO bookings (order_id, customer_name, email, phone, cccd,
              costume_id, costume_name, rental_date, return_date, deposit, total, status, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (order_id) DO UPDATE SET
               customer_name=EXCLUDED.customer_name, email=EXCLUDED.email,
               phone=EXCLUDED.phone, status=EXCLUDED.status, updated_at=NOW()`,
            [
              booking.orderId || booking.order_id,
              booking.customerName || booking.customer_name,
              booking.email,
              booking.phone,
              booking.cccd,
              booking.costumeId || booking.costume_id,
              booking.costumeName || booking.costume_name,
              booking.rentalDate || booking.rental_date,
              booking.returnDate || booking.return_date,
              booking.deposit || 0,
              booking.total || 0,
              booking.status || 'pending',
              booking.notes || '',
            ]
          );
        }
        return res.status(200).json({ success: true, imported: payload.length });
      }

      // Single booking insert
      const {
        orderId, customerName, email, phone, cccd,
        costumeId, costumeName, rentalDate, returnDate,
        deposit = 0, total = 0, notes = ''
      } = payload;

      if (!orderId) return res.status(400).json({ error: 'orderId is required' });

      await query(
        `INSERT INTO bookings (order_id, customer_name, email, phone, cccd,
          costume_id, costume_name, rental_date, return_date, deposit, total, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12)
         ON CONFLICT (order_id) DO UPDATE SET
           customer_name=EXCLUDED.customer_name, email=EXCLUDED.email,
           phone=EXCLUDED.phone, updated_at=NOW()`,
        [orderId, customerName, email, phone, cccd,
         costumeId, costumeName, rentalDate, returnDate,
         deposit, total, notes]
      );

      return res.status(200).json({ success: true, orderId });
    } catch (err) {
      console.error('[bookings POST]', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
