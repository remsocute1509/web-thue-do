import fs from 'fs';

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
    const payload = req.body || {};
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
      const cleanKey = matchedOrder.replace('#', '');
      const paidOrders = getPaidOrders();
      paidOrders[cleanKey] = {
        orderId: matchedOrder.startsWith('#') ? matchedOrder : `#${matchedOrder}`,
        amount: amount,
        content: content,
        gateway: gateway,
        time: date
      };
      savePaidOrders(paidOrders);
      console.log(`[ORDER APPROVED]: ${matchedOrder} - ${amount}đ`);
    }

    // SePay yêu cầu phản hồi HTTP 200 kèm JSON success: true
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
