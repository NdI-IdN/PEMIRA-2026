// GET /api/results -> hasil voting live. Hanya untuk admin (butuh cookie sesi).
const { getSessionUser } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  if (!getSessionUser(req)) {
    res.status(401).json({ ok: false, error: 'Tidak diizinkan.' });
    return;
  }

let counts;
let activity;
try {
  counts = await store.getCounts();
  activity = await store.getActivity(5000); // ambil semua, bukan cuma 20
} catch (e) {
  res.status(500).json({
    ok: false,
    error: 'Gagal membaca data. Di Vercel: aktifkan Storage KV (Upstash).',
  });
  return;
}

// hitung partisipasi per kelas dari SEMUA data
const classCounts = {};
activity.forEach((a) => {
  const cls = a.class || 'Lainnya';
  classCounts[cls] = (classCounts[cls] || 0) + 1;
});

const votesIn = [1, 2, 3, 4].reduce((sum, i) => sum + (counts[i] || 0), 0);
const totalVoters = Number(process.env.TOTAL_VOTERS) || 240;

res.setHeader('Cache-Control', 'no-store');
res.status(200).json({
  ok: true,
  counts,
  votesIn,
  totalVoters,
  activity,      // sekarang lengkap, jadi tabel riwayat juga lengkap
  classCounts,   // dipakai grafik partisipasi per kelas
  storage: store.usingKv() ? 'kv' : 'file',
  updatedAt: Date.now(),
});
};
