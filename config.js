// GET  /api/config  -> { ok:true, config:{ sessionName, totalVoters, boothCount } }   (PUBLIC - dibaca kiosk & panitia)
// POST /api/config  { sessionName?, totalVoters?, boothCount? } -> update             (khusus panitia login)
//
// Disimpan di Datastore (KV), bukan localStorage, supaya semua device panitia
// melihat & mengubah konfigurasi yang sama. boothCount di-clamp 1..MAX_BOOTHS
// di SERVER, jadi tidak bisa dibypass biarpun request dikirim langsung ke API.
const { readBody, getSessionUser } = require('./_lib');
const store = require('./_store');

const MAX_BOOTHS = 30;

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const config = await store.getConfig();
      res.status(200).json({ ok: true, config, maxBooths: MAX_BOOTHS });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Gagal mengambil konfigurasi dari Datastore.' });
    }
    return;
  }

  if (req.method === 'POST') {
    const user = getSessionUser(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    const body = await readBody(req);
    const patch = {};

    if (body.sessionName !== undefined) {
      const name = String(body.sessionName || '').trim().slice(0, 60);
      if (name) patch.sessionName = name;
    }

    if (body.totalVoters !== undefined) {
      const n = Number(body.totalVoters);
      if (!Number.isFinite(n) || n <= 0) {
        res.status(400).json({ ok: false, error: 'Target kapasitas saksi tidak valid.' });
        return;
      }
      patch.totalVoters = Math.floor(n);
    }

    if (body.boothCount !== undefined) {
      let n = Number(body.boothCount);
      if (!Number.isFinite(n)) {
        res.status(400).json({ ok: false, error: 'Jumlah bilik tidak valid.' });
        return;
      }
      n = Math.floor(n);
      // Hard cap di server: mau apapun yang dikirim client, tetap 1..30.
      if (n < 1) n = 1;
      if (n > MAX_BOOTHS) n = MAX_BOOTHS;
      patch.boothCount = n;
    }

    try {
      const config = await store.setConfig(patch);
      res.status(200).json({ ok: true, config, maxBooths: MAX_BOOTHS });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Gagal menyimpan konfigurasi ke Datastore.' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
};
