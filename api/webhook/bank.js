import fs from 'fs';

const KV_BUCKET = '4fVC3QnzuUwxGeVLvAhHAb';
const TMP_FILE = '/tmp/paid_orders.json';

function getPaidOrders() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      return JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'));
    }
  } catch (e) { }
  return global._paidOrders || {};
}

function savePaidOrders(data) {
  global._paidOrders = data;
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data), 'utf-8');
  } catch (e) { }
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch(e) {}
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch(e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(200).json({ success: true, message: 'SePay Webhook ready' });
  }

  try {
    const payload = await parseBody(req);
    console.log('[SEPAY WEBHOOK RECEIVED]:', JSON.stringify(payload));

    const content = String(payload.content || payload.description || payload.code || '');
    const amount = payload.transferAmount || payload.amount || 0;
    const gateway = payload.gateway || payload.subAccount || 'MBBank';
    const date = payload.transactionDate || payload.when || new Date().toLocaleString('vi-VN');

    // Regex tìm mã đơn hàng MC29138 hoặc MC-29138
    const match = content.match(/MC[-_]?\d+/i);
    let matchedOrder = match ? match[0].toUpperCase().replace('_', '-') : '';
    if (!matchedOrder && payload.orderId) {
      matchedOrder = String(payload.orderId).toUpperCase().replace('_', '-');
    }

    if (matchedOrder) {
      const cleanKey = matchedOrder.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const orderData = {
        orderId: matchedOrder.startsWith('#') ? matchedOrder : `#${matchedOrder}`,
        amount: amount,
        content: content,
        gateway: gateway,
        time: date,
        paid: true
      };

      // 1. Lưu local /tmp
      const paidOrders = getPaidOrders();
      paidOrders[cleanKey] = orderData;
      savePaidOrders(paidOrders);

      // 2. Lưu Cloud KV dùng chung toàn bộ Vercel Serverless Containers
      try {
        await fetch(`https://kvdb.io/${KV_BUCKET}/${cleanKey}`, {
          method: 'POST',
          body: JSON.stringify(orderData)
        });
      } catch (kvErr) {
        console.error('KV save error:', kvErr);
      }

      console.log(`[ORDER APPROVED]: ${matchedOrder} - ${amount}đ`);
    }

    return res.status(200).json({
      success: true,
      matchedOrder: matchedOrder,
      message: 'Webhook processed successfully'
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ success: true, message: 'Error handled' });
  }
}
