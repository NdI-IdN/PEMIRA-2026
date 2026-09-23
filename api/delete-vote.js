// POST /api/delete-vote  { receipt }
const { getSessionUser, readBody } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  // Keamanan: Hanya panitia yang sudah login yang bisa menghapus
  if (!getSessionUser(req)) {
    res.status(401).json({ ok: false, error: 'Akses ditolak. Silakan login sebagai panitia.' });
    return;
  }

  const body = await readBody(req);
  const receipt = (body.receipt || '').toString().trim();

  if (!receipt) {
    res.status(400).json({ ok: false, error: 'Kode receipt wajib disertakan.' });
    return;
  }

  try {
    const result = await store.deleteSingleVote(receipt);
    if (!result.success) {
      res.status(404).json({ ok: false, error: result.message || 'Data tidak ditemukan.' });
      return;
    }
    res.status(200).json({ ok: true, message: '1 data suara berhasil dihapus.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Gagal menghapus data dari server.' });
  }
};
