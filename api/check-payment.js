// api/check-payment.js
// Kiểm tra trạng thái thanh toán - Public (không lộ dữ liệu cá nhân)
// Hỗ trợ tự động khớp lệnh trực tiếp từ SePay API khi webhook bị chậm/chạy dev

import { query } from './_lib/db.js';
import { sendPaymentNotification } from './_lib/discord.js';

let sepayCache = { time: 0, data: [] };

async function checkSepayDirect(cleanKey) {
  const apiKey = process.env.SEPAY_API_KEY;
  if (!apiKey || !cleanKey) return null;

  const now = Date.now();
  let transactions = [];
  if (now - sepayCache.time < 3000 && sepayCache.data.length > 0) {
    transactions = sepayCache.data;
  } else {
    try {
      const resp = await fetch('https://my.sepay.vn/userapi/transactions/list', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      if (resp.ok) {
        const json = await resp.json();
        transactions = json.transactions || [];
        sepayCache = { time: now, data: transactions };
      }
    } catch (e) {
      console.warn('[SEPAY SYNC] Fetch error:', e.message);
      transactions = sepayCache.data || [];
    }
  }

  const target = cleanKey.toUpperCase();
  for (const tx of transactions) {
    const content = String(tx.transaction_content || '');
    const cleanContent = content.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanContent.includes(target)) {
      const amount = Math.round(Number(tx.amount_in) || 0);
      const gateway = tx.bank_brand_name || 'MBBank';
      const dateStr = tx.transaction_date || new Date().toISOString();

      // Tìm thông tin khách hàng từ bookings
      let customer = {};
      let matchedId = `#${target}`;
      try {
        const bRes = await query(
          `SELECT order_id, customer_name, email, phone FROM bookings
           WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER($1) LIMIT 1`,
          [target]
        );
        if (bRes.rows.length > 0) {
          matchedId = bRes.rows[0].order_id || matchedId;
          customer = bRes.rows[0];
        }
      } catch (e) {}

      // Lưu vào paid_orders
      try {
        await query(
          `INSERT INTO paid_orders (order_id, amount, content, gateway, paid_at, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (order_id) DO UPDATE SET
             amount=EXCLUDED.amount, content=EXCLUDED.content,
             gateway=EXCLUDED.gateway, paid_at=EXCLUDED.paid_at, raw_payload=EXCLUDED.raw_payload`,
          [matchedId, amount, content, gateway, dateStr, JSON.stringify(tx)]
        );

        // Cập nhật bookings
        await query(
          `UPDATE bookings
           SET status = 'Đã thanh toán (Tự động duyệt qua MB Bank) 🌸', updated_at = NOW()
           WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER($1)`,
          [target]
        );

        // Bắn Discord
        await sendPaymentNotification({
          orderId: matchedId,
          amount,
          content,
          gateway,
          time: dateStr,
          customerName: customer.customer_name,
          email: customer.email,
          phone: customer.phone
        });
      } catch (dbErr) {
        console.warn('[SEPAY SYNC] DB error:', dbErr.message);
      }

      return {
        order_id: matchedId,
        amount,
        gateway,
        paid_at: dateStr
      };
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawOrderId = String(req.query.orderId || '').trim();
  const cleanId = rawOrderId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!cleanId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  try {
    // 1. Tìm trong paid_orders bằng case-insensitive & bỏ ký tự đặc biệt
    const result = await query(
      `SELECT order_id, amount, gateway, paid_at
       FROM paid_orders
       WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = $1
       LIMIT 1`,
      [cleanId]
    );

    let row = result.rows.length > 0 ? result.rows[0] : null;

    // 2. Nếu chưa có, tự động quét SePay API trực tiếp
    if (!row) {
      row = await checkSepayDirect(cleanId);
    }

    if (row) {
      return res.status(200).json({
        orderId: row.order_id || rawOrderId,
        paid: true,
        transaction: {
          orderId: row.order_id,
          amount: row.amount,
          gateway: row.gateway,
          time: row.paid_at,
        }
      });
    }

    return res.status(200).json({ orderId: rawOrderId, paid: false, transaction: null });
  } catch (err) {
    console.error('[check-payment]', err.message);
    return res.status(500).json({ error: 'Database error' });
  }
}
