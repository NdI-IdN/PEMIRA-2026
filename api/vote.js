// POST /api/vote  { candidate, name, class, booth }
// Rekam suara + catat aktivitas (nama utuh tanpa sensor). Storage: KV atau file JSON.
const { readBody } = require('./_lib');
const store = require('./_store');

const VALID = ['1', '2', '3', '4'];

// Fungsi diubah hanya untuk membersihkan spasi berlebih, tanpa menyensor nama
function cleanName(name) {
  const clean = (name || '').toString().trim();
  if (!clean) return 'Anonim';
  return clean;
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
    name: cleanName(body.name), // Menggunakan nama asli
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
