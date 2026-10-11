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
    const target = orderId.toLowerCase();
    for (const [key, val] of Object.entries(paidOrders)) {
      const kClean = key.replace('#', '').toLowerCase();
      if (kClean === target || target.includes(kClean) || kClean.includes(target)) {
        isPaid = true;
        txInfo = val;
        break;
      }
    }

    // Nếu chưa thấy trong cache và có cấu hình SEPAY_API_KEY, tự động đối soát trực tiếp với SePay API
    if (!isPaid && process.env.SEPAY_API_KEY) {
      try {
        const sepayRes = await fetch('https://my.sepay.vn/userapi/transactions/list?limit=20', {
          headers: {
            'Authorization': `Apikey ${process.env.SEPAY_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        if (sepayRes.ok) {
          const sepayData = await sepayRes.json();
          const list = sepayData.messages || sepayData.transactions || [];
          const matchTx = list.find(t => {
            const desc = (t.transaction_content || t.description || t.content || '').toLowerCase();
            return desc.includes(target);
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
