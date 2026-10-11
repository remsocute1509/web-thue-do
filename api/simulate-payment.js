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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = req.body || {};
  const orderId = String(payload.orderId || '').trim().replace('#', '');

  if (orderId) {
    const paidOrders = getPaidOrders();
    paidOrders[orderId] = {
      orderId: `#${orderId}`,
      amount: payload.amount || 150000,
      content: `THUEDO ${orderId}`,
      gateway: 'MBBank (0377193835)',
      time: 'Vừa xong'
    };
    savePaidOrders(paidOrders);
  }

  return res.status(200).json({ success: true, orderId });
}
