// POST /api/login  { username, password }
// Verifikasi ke env ADMIN_USERNAME / ADMIN_PASSWORD, set cookie sesi.
const { readBody, setSessionCookie, safeEqual } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;
  if (!envUser || !envPass) {
    res.status(500).json({ ok: false, error: 'Server belum dikonfigurasi (ADMIN_USERNAME/ADMIN_PASSWORD).' });
    return;
  }

  const body = await readBody(req);
  const username = (body.username || '').toString().trim();
  const password = (body.password || '').toString();

  const okUser = safeEqual(username, envUser);
  const okPass = safeEqual(password, envPass);
  if (!okUser || !okPass) {
    res.status(401).json({ ok: false, error: 'Username atau password admin tidak sesuai.' });
    return;
  }

  setSessionCookie(req, res, username);
  res.status(200).json({ ok: true, username });
};
