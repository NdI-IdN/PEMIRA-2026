// GET  /api/alert            -> { ok:true, alerts:[...aktif], log:[...permanen] }   (khusus panitia)
// GET  /api/alert?full=1     -> sama, tapi "log" ambil riwayat lebih banyak (buat halaman ?errorlogs)
// POST /api/alert  { action: 'dismiss', id } -> hapus SATU alert aktif (log permanen tidak terhapus)
//
// Alert (duplikasi NIS / NIS ditolak roster) dibuat oleh /api/vote dan disimpan
// di Datastore (KV), supaya semua device panitia yang login melihat data yang sama.
// Alert aktif bisa lebih dari satu bersamaan (stack) dan didismiss satu-satu lewat id.
const { readBody, getSessionUser } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, 'http://internal');
      const full = url.searchParams.get('full') === '1';
      const [alerts, log] = await Promise.all([
        store.getLiveAlerts(),
        store.getAlertLog(full ? 1000 : 100),
      ]);
      res.status(200).json({ ok: true, alerts, log });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Gagal mengambil alert dari Datastore.' });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.action !== 'dismiss') {
      res.status(400).json({ ok: false, error: 'Aksi tidak dikenal.' });
      return;
    }
    const id = (body.id || '').toString().trim();
    if (!id) {
      res.status(400).json({ ok: false, error: 'id alert wajib diisi.' });
      return;
    }
    try {
      // Hanya menghapus SATU alert aktif (yang id-nya cocok). Riwayat permanen
      // (pemira:alert-log) tidak disentuh sama sekali di sini.
      await store.dismissLiveAlert(id);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Gagal menghapus alert di Datastore.' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
};
