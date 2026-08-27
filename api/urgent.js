// GET /api/urgent -> Data voting lengkap no anonim. Hanya untuk admin.
const { getSessionUser } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  // Cek keamanan sesi admin
  if (!getSessionUser(req)) {
    res.status(401).json({ ok: false, error: 'Tidak diizinkan. Harap login admin.' });
    return;
  }

  let activity;
  try {
    // Menggunakan fungsi yang PASTI ADA di _store.js bos, 
    // tapi kita tarik batasnya sampai 1000 agar SEMUA data masuk
    activity = await store.getActivity(1000); 
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: 'Gagal membaca data penuh. Di Vercel: pastikan Storage KV menyala.',
    });
    return;
  }

  // Keluarkan semua datanya tanpa sensor
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    total_suara_terekam: activity ? activity.length : 0,
    data_lengkap: activity, 
    storage: store.usingKv() ? 'kv' : 'file',
    diakses_pada: new Date().toLocaleString('id-ID'),
  });
};
