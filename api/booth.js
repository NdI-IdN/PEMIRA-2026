import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { booth, status } = req.body;
    if (!booth || booth === 'Pribadi') return res.status(400).json({ ok: false });

    try {
      // Simpan status booth terakhir ke KV dengan timestamp
      const boothData = { status: status || 'Standby', lastPing: Date.now() };
      await kv.set(`booth_status:${booth}`, boothData);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'GET') {
    try {
      // Ambil semua status booth yang aktif untuk dipantau panitia
      // Kita scan key yang berawalan booth_status:
      const keys = await kv.keys('booth_status:*');
      const booths = {};
      
      for (const key of keys) {
        const boothNum = key.split(':')[1];
        const data = await kv.get(key);
        if (data) booths[boothNum] = data;
      }

      return res.status(200).json({ ok: true, booths });
    } catch (e) {
      return res.status(500).json({ ok: false, booths: {} });
    }
  }

  return res.status(405).json({ ok: false });
}
