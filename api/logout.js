// POST /api/logout -> hapus cookie sesi.
const { clearSessionCookie } = require('./_lib');

module.exports = async (req, res) => {
  clearSessionCookie(req, res);
  res.status(200).json({ ok: true });
};
