// POST /api/vote  { candidate, name, class, booth }
// Rekam suara + catat aktivitas (nama di-mask). Storage: KV atau file JSON.
const { readBody } = require('./_lib');
const store = require('./_store');

const VALID = ['1', '2', '3', '4'];

function maskName(name) {
  const clean = (name || '').toString().trim();
  if (!clean) return 'Anonim';
  return clean
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => (w[0] ? w[0].toUpperCase() + '****' : ''))
    .join(' ')
    .trim();
}

function jakartaTime() {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(11, 16);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = await readBody(req);
  const candidate = (body.candidate || '').toString();
  if (!VALID.includes(candidate)) {
    res.status(400).json({ ok: false, error: 'Kandidat tidak valid.' });
    return;
  }

  const entry = {
    name: maskName(body.name),
    class: (body.class || '-').toString().slice(0, 24),
    booth: (body.booth || '-').toString().slice(0, 4),
    time: jakartaTime(),
    ts: Date.now(),
  };

  try {
    await store.incrVote(candidate);
    await store.pushActivity(entry);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: 'Gagal menyimpan suara. Di Vercel: aktifkan Storage KV (Upstash).',
    });
    return;
  }

  const receipt = 'PM-' + Math.floor(100000 + Math.random() * 899999);
  res.status(200).json({ ok: true, receipt });
};
