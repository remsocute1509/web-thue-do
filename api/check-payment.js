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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const orderId = String(req.query.orderId || '').trim().replace('#', '');
  const paidOrders = getPaidOrders();

  let isPaid = false;
  let txInfo = null;

  if (orderId) {
    const cleanTarget = orderId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // 1. Kiểm tra cache /tmp
    for (const [key, val] of Object.entries(paidOrders)) {
      const kClean = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const valId = String(val?.orderId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const valContent = String(val?.content || '').toLowerCase();
      if (cleanTarget && (kClean === cleanTarget || cleanTarget.includes(kClean) || kClean.includes(cleanTarget) || valId === cleanTarget || valContent.includes(cleanTarget))) {
        isPaid = true;
        txInfo = val;
        break;
      }
    }

    // 2. Kiểm tra Cloud KV dùng chung toàn bộ Vercel Serverless
    if (!isPaid && cleanTarget) {
      try {
        const kvRes = await fetch(`https://kvdb.io/${KV_BUCKET}/${cleanTarget}`);
        if (kvRes.ok) {
          const kvData = await kvRes.json();
          if (kvData) {
            isPaid = true;
            txInfo = kvData;
          }
        }
      } catch (kvErr) {
        console.error('KV check error:', kvErr);
      }
    }

    // 3. Dự phòng đối soát trực tiếp SePay API nếu có cấu hình
    const sepayKey = process.env.SEPAY_API_KEY;
    if (!isPaid && sepayKey && cleanTarget) {
      try {
        const sepayRes = await fetch('https://my.sepay.vn/userapi/transactions/list?limit=30', {
          headers: {
            'Authorization': `Apikey ${sepayKey}`,
            'Content-Type': 'application/json'
          }
        });
        if (sepayRes.ok) {
          const sepayData = await sepayRes.json();
          const list = sepayData.messages || sepayData.transactions || [];
          const matchTx = list.find(t => {
            const desc = (t.transaction_content || t.description || t.content || '').toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
            return desc.includes(cleanTarget);
          });
          if (matchTx) {
            isPaid = true;
            txInfo = {
              orderId: `#${orderId}`,
              amount: matchTx.amount_in || matchTx.transferAmount || 0,
              content: matchTx.transaction_content || matchTx.description || '',
              gateway: matchTx.bank_brand_name || 'MBBank',
              time: matchTx.transaction_date || 'Vừa xong'
            };
          }
        }
      } catch (apiErr) {
        console.error('SePay API check error:', apiErr);
      }
    }
  }

  return res.status(200).json({
    orderId: orderId,
    paid: isPaid,
    transaction: txInfo
  });
}
