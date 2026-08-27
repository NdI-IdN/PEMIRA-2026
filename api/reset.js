// POST /api/reset -> hapus semua suara & aktivitas. Hanya admin.
// Berguna untuk menghapus data uji sebelum pemilihan yang sebenarnya.
const { getSessionUser } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  if (!getSessionUser(req)) {
    res.status(401).json({ ok: false, error: 'Tidak diizinkan.' });
    return;
  }

  try {
    await store.reset();
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Gagal reset data.' });
    return;
  }
  res.status(200).json({ ok: true });
};
