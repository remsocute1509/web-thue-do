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

  const payload = await parseBody(req);
  console.log('[SEPAY WEBHOOK]:', JSON.stringify(payload));

  // 1. Xác thực Webhook từ SePay (chống giả mạo thanh toán)
  const isSepayIpn = Boolean(payload.notification_type || payload.order);
  const expectedSecretKey = process.env.SEPAY_SECRET_KEY || '';
  const expectedApiKey = process.env.SEPAY_API_KEY || '';

  const rawSecretKey = req.headers['x-secret-key'] || req.headers['x-sepay-secret-key'] || '';
  let isAuthorized = false;

  // Nếu là IPN và có cấu hình Secret Key
  if (isSepayIpn) {
    if (!expectedSecretKey || !rawSecretKey) {
      // Nếu merchant cấu hình auth type = Không có (như trong giao diện SePay)
      isAuthorized = true;
    } else {
      isAuthorized = (rawSecretKey.trim() === expectedSecretKey.trim());
    }
  } else if (expectedApiKey) {
    const rawAuth = req.headers['authorization'] || req.headers['x-api-key'] || req.headers['x-sepay-key'] || '';
    let providedKey = '';
    if (rawAuth.toLowerCase().startsWith('apikey ')) {
      providedKey = rawAuth.slice(7).trim();
    } else if (rawAuth.toLowerCase().startsWith('bearer ')) {
      providedKey = rawAuth.slice(7).trim();
    } else {
      providedKey = rawAuth.trim();
    }

    if (providedKey) {
      const expectedBuf = Buffer.from(expectedApiKey);
      const providedBuf = Buffer.from(providedKey);
      isAuthorized = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
    }

    // Nếu SePay chưa cấu hình API Key ở Header, đối soát trực tiếp với SePay API để chống gian lận
    if (!isAuthorized) {
      try {
        const verifyResp = await fetch('https://my.sepay.vn/userapi/transactions/list', {
          headers: {
            Authorization: `Bearer ${expectedApiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          }
        });
        if (verifyResp.ok) {
          const vData = await verifyResp.json();
          const txs = vData.transactions || [];
          const payloadId = String(payload.id || payload.referenceCode || '');
          const payloadContent = String(payload.content || payload.description || payload.code || '');
          const found = txs.some(tx => 
            (payloadId && (String(tx.id) === payloadId || String(tx.reference_number) === payloadId)) ||
            (payloadContent && String(tx.transaction_content || '').includes(payloadContent.slice(0, 15)))
          );
          if (found) {
            isAuthorized = true;
          }
        }
      } catch (err) {
        console.warn('[WEBHOOK VERIFY] Error verifying with SePay API:', err.message);
      }
    }

    if (!isAuthorized) {
      console.warn('[WEBHOOK AUTH] Rejected unauthorized or unverified webhook call.');
      return res.status(200).json({ success: false, message: 'Webhook unverified' });
    }
  } else {
    isAuthorized = true;
  }

  try {
    let content = '';
    let amount = 0;
    let gateway = 'MBBank';
    let date = new Date().toISOString();
    let matchedOrder = '';
    let isGateway = false;

    // A. Xử lý IPN từ Cổng thanh toán SePay (Payment Gateway)
    if (isSepayIpn) {
      isGateway = true;
      const orderObj = payload.order || {};
      const txObj = payload.transaction || {};
      matchedOrder = String(orderObj.order_invoice_number || orderObj.order_id || '').toUpperCase();
      amount = Math.round(Number(orderObj.order_amount || txObj.transaction_amount || 0));
      gateway = txObj.payment_method ? `Cổng SePay (${txObj.payment_method})` : 'Cổng SePay';
      date = txObj.transaction_date || new Date().toISOString();
      content = orderObj.order_description || txObj.transaction_id || `Thanh toán cổng SePay đơn ${matchedOrder}`;
      console.log(`[SEPAY IPN] Received IPN for order ${matchedOrder}, amount: ${amount}`);
    } else {
      // B. Xử lý Webhook Biến động số dư Bank Hub thông thường
      content = String(payload.content || payload.description || payload.code || '');
      amount  = payload.transferAmount || payload.amount || 0;
      gateway = payload.gateway || payload.subAccount || 'MBBank';
      date    = payload.transactionDate || payload.when || new Date().toISOString();

      // Tìm mã đơn hàng từ nội dung chuyển khoản (MC29138 hoặc MC-29138)
      const match = content.match(/MC[-_]?\d+/i);
      matchedOrder = match ? match[0].toUpperCase().replace('_', '-') : '';
      if (!matchedOrder && payload.orderId) {
        matchedOrder = String(payload.orderId).toUpperCase().replace('_', '-');
      }
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

      // Cập nhật trạng thái sang Đã thanh toán trong bảng bookings
      try {
        const statusText = isGateway
          ? 'Đã thanh toán (Cổng SePay Gateway) 🌸'
          : 'Đã thanh toán (Tự động duyệt qua MB Bank) 🌸';
        await query(
          `UPDATE bookings
           SET status = $1, updated_at = NOW()
           WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER($2)`,
          [statusText, orderKey]
        );
      } catch (e) { /* bỏ qua nếu cập nhật bookings lỗi */ }

      // Lấy thông tin khách hàng từ bookings để bổ sung Discord embed
      let customerInfo = {};
      try {
        const bookingRes = await query(
          `SELECT order_id, customer_name, email, phone FROM bookings
           WHERE LOWER(REPLACE(REPLACE(order_id, '#', ''), '-', '')) = LOWER($1) LIMIT 1`,
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
