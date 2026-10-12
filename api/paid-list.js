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

  const paidOrders = getPaidOrders();
  return res.status(200).json(paidOrders);
}
