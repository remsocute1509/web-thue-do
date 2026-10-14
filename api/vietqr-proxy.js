/**
 * VietQR Image Proxy (Vercel Serverless Function)
 * Enables CORS-safe client-side Canvas rendering & pixel processing
 */
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || (!url.startsWith('https://img.vietqr.io/') && !url.startsWith('https://api.vietqr.io/'))) {
    return res.status(400).json({ error: 'Chỉ hỗ trợ proxy ảnh từ VietQR' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MochymoonCosplay/1.0'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=3600');
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[VietQR Proxy] Error:', err);
    return res.status(502).json({ error: err.message });
  }
}
