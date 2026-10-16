// api/test-pay.js
// Endpoint tạo nhanh đơn hàng test 10k và tự động chuyển hướng sang pay.sepay.vn

import crypto from 'crypto';
import { query } from './_lib/db.js';

export default async function handler(req, res) {
  const merchantId = process.env.SEPAY_MERCHANT_ID || '';
  const secretKey = process.env.SEPAY_SECRET_KEY || '';

  if (!merchantId || !secretKey) {
    return res.status(500).send('<h1>Lỗi: Chưa cấu hình SEPAY_MERCHANT_ID hoặc SEPAY_SECRET_KEY</h1>');
  }

  const amount = 10000;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const cleanInvoice = `MCTEST${suffix}`;
  const orderId = `#MC-TEST${suffix}`;

  // Lưu đơn test vào Supabase
  try {
    await query(
      `INSERT INTO bookings (order_id, customer_name, email, phone, costume_name, rental_date, return_date, deposit, total, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (order_id) DO NOTHING`,
      [orderId, 'Khách Test Cổng SePay 10k', 'test@mochicosplay.com', '0377193835', 'Test Cổng SePay 10k', 'Hôm nay', 'Ngày mai', 0, amount, 'pending']
    );
  } catch (e) {
    console.warn('[TEST PAY] DB insert error:', e.message);
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'mochicosplay.vercel.app';
  const baseUrl = `${proto}://${host}`;

  const fields = {
    order_amount: amount,
    merchant: merchantId,
    currency: 'VND',
    operation: 'PURCHASE',
    order_description: `Thanh toan test 10k ${orderId}`,
    order_invoice_number: cleanInvoice,
    success_url: `${baseUrl}/?payment=success&orderId=${cleanInvoice}`,
    error_url: `${baseUrl}/?payment=error&orderId=${cleanInvoice}`,
    cancel_url: `${baseUrl}/?payment=cancel&orderId=${cleanInvoice}`
  };

  const orderedKeys = [
    'order_amount',
    'merchant',
    'currency',
    'operation',
    'order_description',
    'order_invoice_number',
    'customer_id',
    'payment_method',
    'success_url',
    'error_url',
    'cancel_url'
  ];

  const parts = [];
  for (const k of orderedKeys) {
    const val = fields[k];
    if (val !== undefined && val !== null && String(val) !== '') {
      parts.push(`${k}=${val}`);
    }
  }

  const signedString = parts.join(',');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(signedString, 'utf-8')
    .digest('base64');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Đang chuyển sang Cổng Thanh Toán SePay...</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
    .box { text-align: center; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 400px; }
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #0284c7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { color: #1e293b; margin: 0 0 10px; }
    p { color: #64748b; font-size: 14px; margin: 0; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2>Đang mở Cổng SePay...</h2>
    <p>Đơn hàng: <strong>${orderId}</strong> (10.000 VNĐ)</p>
    <form id="sepayForm" action="https://pay.sepay.vn/v1/checkout/init" method="POST">
      ${orderedKeys.filter(k => fields[k]).map(k => `<input type="hidden" name="${k}" value="${fields[k]}">`).join('\n      ')}
      <input type="hidden" name="signature" value="${signature}">
    </form>
  </div>
  <script>
    document.getElementById('sepayForm').submit();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
