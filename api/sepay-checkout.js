// api/sepay-checkout.js
// Khởi tạo phiên thanh toán Cổng thanh toán SePay (Payment Gateway)
// Chuyển hướng khách hàng tới pay.sepay.vn

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const merchantId = process.env.SEPAY_MERCHANT_ID || '';
  const secretKey = process.env.SEPAY_SECRET_KEY || '';

  if (!merchantId || !secretKey) {
    return res.status(500).json({
      error: 'SePay Payment Gateway chưa được cấu hình SEPAY_MERCHANT_ID hoặc SEPAY_SECRET_KEY trong .env'
    });
  }

  const body = req.body || {};
  const rawOrderId = String(body.orderId || '').trim();
  const cleanInvoice = rawOrderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || `MC${Date.now()}`;
  const amount = Math.round(Number(body.amount) || 150000);
  const description = String(body.description || `Thue do cosplay ${rawOrderId || cleanInvoice}`).slice(0, 250);

  // Lấy domain hiện tại
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'mochicosplay.vercel.app';
  const baseUrl = `${proto}://${host}`;

  const successUrl = body.successUrl || `${baseUrl}/?payment=success&orderId=${encodeURIComponent(rawOrderId || cleanInvoice)}`;
  const errorUrl = body.errorUrl || `${baseUrl}/?payment=error&orderId=${encodeURIComponent(rawOrderId || cleanInvoice)}`;
  const cancelUrl = body.cancelUrl || `${baseUrl}/?payment=cancel&orderId=${encodeURIComponent(rawOrderId || cleanInvoice)}`;

  const fields = {
    order_amount: amount,
    merchant: merchantId,
    currency: 'VND',
    operation: 'PURCHASE',
    order_description: description,
    order_invoice_number: cleanInvoice,
    success_url: successUrl,
    error_url: errorUrl,
    cancel_url: cancelUrl
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

  const finalFields = {
    ...fields,
    signature
  };

  return res.status(200).json({
    success: true,
    checkoutUrl: 'https://pay.sepay.vn/v1/checkout/init',
    signedString,
    fields: finalFields
  });
}
