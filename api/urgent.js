// GET /api/urgent -> Data voting lengkap no anonim (nama, kelas, pilihan). Hanya untuk admin.
const { getSessionUser } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  // 1. Cek keamanan: Hanya admin yang boleh akses
  if (!getSessionUser(req)) {
    res.status(401).json({ ok: false, error: 'Tidak diizinkan. Harap login admin.' });
    return;
  }

  let fullData;
  try {
    // 2. Tarik semua data mentah dari database. 
    // Catatan: Pastikan bos sudah membuat fungsi getAllVotes() di dalam file _store.js 
    // atau gunakan fungsi yang sudah ada (misal: await store.getActivity(1000);)
    fullData = await store.getAllVotes(); 
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: 'Gagal membaca data penuh. Di Vercel: pastikan Storage KV menyala.',
    });
    return;
  }

  // 3. Kirim hasil responsenya
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    total_suara_masuk: fullData ? fullData.length : 0,
    data_lengkap: fullData, // Ini yang akan memunculkan array berisi nama, kelas, dll
    storage: store.usingKv() ? 'kv' : 'file',
    diakses_pada: new Date().toLocaleString('id-ID'),
  });
};