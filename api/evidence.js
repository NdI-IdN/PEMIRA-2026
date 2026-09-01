// GET /api/evidence?receipt=PM-123456 -> verifikasi receipt.
// Letakkan file ini sebagai api/evidence.js di deployment.
const { getSessionUser } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
    return;
  }

  if (!getSessionUser(req)) {
    res.status(401).json({
      ok: false,
      error: 'Login panitia diperlukan untuk memverifikasi receipt.',
    });
    return;
  }

  const rawReceipt = req.query && req.query.receipt
    ? req.query.receipt
    : new URL(req.url || '', 'http://localhost').searchParams.get('receipt');
  const receipt = String(rawReceipt || '').trim().toUpperCase();

  if (!/^PM-\d{6}$/.test(receipt)) {
    res.status(200).json({ ok: true, found: false });
    return;
  }

  try {
    const voter = await store.findByReceipt(receipt);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      found: Boolean(voter),
      voter: voter || undefined,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: 'Gagal membaca arsip receipt dari Datastore.',
    });
  }
};