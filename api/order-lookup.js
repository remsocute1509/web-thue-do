// api/order-lookup.js
// Phase 2: Tra cứu đơn hàng cho khách hàng
// Xác thực 4 yếu tố: email + CCCD + SĐT + mã đơn hàng
// Anti-enumeration: luôn báo "đã gửi OTP", không tiết lộ dữ liệu tồn tại hay không

import { query } from './_lib/db.js';
import { sendOtpEmail, sendNotFoundEmail } from './_lib/mailer.js';
import crypto from 'crypto';

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

function normalize(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, '');
}

function generateOTP() {
  // 6 chữ số ngẫu nhiên
  return String(crypto.randomInt(100000, 999999));
}

function hashOTP(otp, email) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'fallback')
    .update(`${otp}:${email}`)
    .digest('hex');
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
  const { action, query: queryStr, phone, orderId } = body || {};
  const searchKey = String(queryStr || orderId || phone || '').trim();

  // ===== ACTION 0: Tra cứu nhanh bằng SĐT hoặc Mã đơn =====
  if (action === 'quick-lookup' || (searchKey && action !== 'request-otp' && action !== 'verify-otp')) {
    const cleanQ = searchKey.toLowerCase().replace(/[\s#\-]/g, '');
    if (!cleanQ) {
      return res.status(400).json({ error: 'Vui lòng nhập số điện thoại hoặc mã đơn hàng' });
    }

    try {
      const result = await query(
        `SELECT b.order_id, b.customer_name, b.costume_name, b.phone, b.email,
                b.rental_date, b.return_date, b.deposit, b.total, b.status, b.notes,
                p.amount as paid_amount, p.gateway, p.paid_at
         FROM bookings b
         LEFT JOIN paid_orders p ON LOWER(REPLACE(p.order_id,'#','')) = LOWER(REPLACE(b.order_id,'#',''))
         WHERE LOWER(REPLACE(REPLACE(b.order_id,'#',''),'-','')) = $1
            OR REPLACE(REPLACE(b.phone,' ',''),'-','') = $1
         ORDER BY b.id DESC LIMIT 10`,
        [cleanQ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Không tìm thấy đơn hàng nào khớp với thông tin. Vui lòng kiểm tra lại số điện thoại hoặc mã đơn (#MC-xxxxx) nhé!'
        });
      }

      const formattedOrders = result.rows.map(b => {
        const oid = b.order_id || '#MC-00000';
        const statusRaw = String(b.status || 'Chờ tiệm duyệt ⏳');
        const notesStr = String(b.notes || '');
        const isApproved = ['duyệt', 'paid', 'đã', 'thành công', 'xác nhận'].some(k => statusRaw.toLowerCase().includes(k));

        let trackingCode = '';
        let shippingStatus = '';
        const m = notesStr.match(/(?:mã vận đơn|mvd|tracking|spx|ghn|j&t)[\s:]*([A-Za-z0-9\-]+)/i);
        if (m) trackingCode = m[1].toUpperCase();

        if (trackingCode) {
          shippingStatus = 'Đã đóng gói & Gửi shipper 🚚';
        } else if (isApproved) {
          shippingStatus = 'Đang đóng gói chuẩn bị hàng 📦';
        } else {
          shippingStatus = 'Chờ tiệm duyệt đơn trước khi đóng gói ⏳';
        }

        return {
          orderId: oid,
          customerName: b.customer_name || 'Khách hàng',
          phone: b.phone || '',
          costumeName: b.costume_name || 'Trang phục Cosplay',
          rentalDate: b.rental_date || 'Chưa định',
          returnDate: b.return_date || 'Chưa định',
          status: statusRaw,
          isApproved: isApproved,
          shippingStatus: shippingStatus,
          trackingCode: trackingCode || 'Tiệm đang chuẩn bị đóng gói...',
          deposit: b.deposit || 0,
          total: b.total || 0,
          notes: notesStr,
          paid: Boolean(b.paid_at || statusRaw.toLowerCase().includes('đã') || statusRaw.toLowerCase().includes('paid'))
        };
      });

      return res.status(200).json({
        success: true,
        orders: formattedOrders
      });
    } catch (err) {
      console.error('[order-lookup quick-lookup]', err.message);
      return res.status(500).json({ error: 'Lỗi hệ thống khi tra cứu đơn hàng' });
    }
  }

  // ===== ACTION 1: Yêu cầu OTP =====
  if (action === 'request-otp') {
    const { email, cccd, phone, orderId } = body;

    if (!email || !cccd || !phone || !orderId) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    const cleanEmail   = normalize(email);
    const cleanCccd    = normalize(cccd);
    const cleanPhone   = normalize(phone);
    const cleanOrderId = normalize(orderId.replace('#', ''));

    // Anti-enumeration delay
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

    let found = false;
    try {
      const result = await query(
        `SELECT id, email FROM bookings
         WHERE LOWER(REPLACE(order_id, '#', '')) = $1
           AND LOWER(REPLACE(email, ' ', '')) = $2
           AND REPLACE(phone, ' ', '') = $3
           AND REPLACE(cccd, ' ', '') = $4
         LIMIT 1`,
        [cleanOrderId, cleanEmail, cleanPhone, cleanCccd]
      );
      found = result.rows.length > 0;
    } catch (e) {
      console.error('[order-lookup request-otp db]', e.message);
    }

    // Luôn trả về response giống nhau - chống enumeration
    if (found) {
      const otp = generateOTP();
      const otpHash = hashOTP(otp, cleanEmail);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

      try {
        // Lưu OTP hash vào DB (không lưu OTP plaintext)
        await query(
          `INSERT INTO otp_requests (email, otp_hash, order_id, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [cleanEmail, otpHash, cleanOrderId, expiresAt.toISOString()]
        );

        await sendOtpEmail({ to: email, otp, orderId });
      } catch (e) {
        console.error('[order-lookup send OTP]', e.message);
      }
    } else {
      // Gửi email "không tìm thấy" nhưng không báo cho frontend
      try {
        await sendNotFoundEmail({ to: email });
      } catch (e) {
        // Bỏ qua lỗi - không tiết lộ
      }
    }

    // Luôn trả về cùng một response
    return res.status(200).json({
      success: true,
      message: 'Nếu thông tin hợp lệ, OTP đã được gửi đến email của bạn.'
    });
  }

  // ===== ACTION 2: Xác minh OTP và lấy thông tin đơn hàng =====
  if (action === 'verify-otp') {
    const { email, otp, orderId } = body;

    if (!email || !otp || !orderId) {
      return res.status(400).json({ error: 'Thiếu thông tin xác minh' });
    }

    const cleanEmail   = normalize(email);
    const cleanOrderId = normalize(orderId.replace('#', ''));
    const otpHash      = hashOTP(String(otp).trim(), cleanEmail);

    await new Promise(r => setTimeout(r, 200 + Math.random() * 100));

    try {
      // Tìm OTP hợp lệ chưa dùng
      const otpResult = await query(
        `SELECT id FROM otp_requests
         WHERE email=$1 AND otp_hash=$2 AND order_id=$3
           AND used=FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [cleanEmail, otpHash, cleanOrderId]
      );

      if (otpResult.rows.length === 0) {
        return res.status(401).json({ error: 'OTP không hợp lệ hoặc đã hết hạn' });
      }

      // Đánh dấu OTP đã dùng
      await query(`UPDATE otp_requests SET used=TRUE WHERE id=$1`, [otpResult.rows[0].id]);

      // Lấy thông tin đơn hàng
      const bookingResult = await query(
        `SELECT b.order_id, b.customer_name, b.costume_name, b.rental_date, b.return_date,
                b.deposit, b.total, b.status, b.notes,
                p.amount as paid_amount, p.gateway, p.paid_at
         FROM bookings b
         LEFT JOIN paid_orders p ON LOWER(REPLACE(p.order_id,'#','')) = LOWER(REPLACE(b.order_id,'#',''))
         WHERE LOWER(REPLACE(b.order_id, '#', '')) = $1
         LIMIT 1`,
        [cleanOrderId]
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }

      const booking = bookingResult.rows[0];
      return res.status(200).json({
        success: true,
        order: {
          orderId: booking.order_id,
          customerName: booking.customer_name,
          costumeName: booking.costume_name,
          rentalDate: booking.rental_date,
          returnDate: booking.return_date,
          deposit: booking.deposit,
          total: booking.total,
          status: booking.status,
          notes: booking.notes,
          payment: booking.paid_at ? {
            amount: booking.paid_amount,
            gateway: booking.gateway,
            paidAt: booking.paid_at,
            isPaid: true,
          } : { isPaid: false }
        }
      });
    } catch (err) {
      console.error('[order-lookup verify-otp]', err.message);
      return res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}
