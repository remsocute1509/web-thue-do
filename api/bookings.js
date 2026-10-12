const KV_BUCKET = '4fVC3QnzuUwxGeVLvAhHAb';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch(e) {}
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      if (payload && Array.isArray(payload)) {
        await fetch(`https://kvdb.io/${KV_BUCKET}/global_bookings`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      return res.status(200).json({ success: true });
    } catch(err) {
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  // GET: Trả về danh sách đơn thuê dùng chung toàn hệ thống
  try {
    const kvRes = await fetch(`https://kvdb.io/${KV_BUCKET}/global_bookings`);
    if (kvRes.ok) {
      const list = await kvRes.json();
      if (Array.isArray(list) && list.length > 0) {
        return res.status(200).json(list);
      }
    }
  } catch(e) {}

  return res.status(200).json([]);
}
