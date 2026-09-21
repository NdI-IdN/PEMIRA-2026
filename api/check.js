import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { name, class: className, booth } = req.body;
  if (!name) {
    return res.status(400).json({ ok: false, error: 'NIS wajib diisi.' });
  }

  try {
    // 1. Cek apakah NIS ini sudah tercatat pernah voting (di _store.js biasanya pakai key voter:NIS atau sejenisnya)
    // Sesuaikan prefix key dengan yang ada di vote.js project lu (biasanya 'voter:' atau 'vote:')
    const existingVote = await kv.get(`voter:${name}`);
    
    if (existingVote) {
      // Catat juga ke log peringatan/duplikasi agar muncul di dashboard panitia
      const alertId = 'alert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const alertData = {
        id: alertId,
        type: 'duplicate',
        name,
        class: className || '-',
        booth: booth || 'Pribadi',
        reasonText: 'Percobaan login duplikat NIS terdeteksi di awal.',
        createdAt: Date.now()
      };
      await kv.set(`alert:${alertId}`, alertData);
      await kv.lpush('alerts_list', alertId);

      return res.status(409).json({
        ok: false,
        code: 'DUPLICATE_VOTER',
        error: 'NIS ini sudah terdaftar memberikan suara.'
      });
    }

    // Kalau aman dan belum pernah memilih
    return.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Gagal menghubungi datastore server.' });
  }
}
