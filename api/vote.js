// POST /api/vote  { candidate, name, class, booth, receipt? }
// Rekam suara + catat aktivitas dengan satu vote per identity. Storage: KV atau file JSON.
const { readBody, maskId } = require('./_lib');
const store = require('./_store');
const { checkVoterNIS } = require('./_roster');

const VALID = ['1', '2', '3', '4'];

// Fungsi diubah hanya untuk membersihkan spasi berlebih, tanpa menyensor nama
function cleanName(name) {
  const clean = (name || '').toString().trim();
  if (!clean) return 'Anonim';
  return clean;
}

function jakartaTime() {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(11, 16);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = await readBody(req);
  const candidate = (body.candidate || '').toString();
  if (!VALID.includes(candidate)) {
    res.status(400).json({ ok: false, error: 'Kandidat tidak valid.' });
    return;
  }

  const rawName = (body.name || '').toString().trim();
  if (!rawName) {
    res.status(400).json({ ok: false, error: 'NIS atau identitas pemilih wajib diisi.' });
    return;
  }

  const rawClass = (body.class || '').toString();
  const isStaff = rawClass === 'Guru/Karyawan';

  // Whitelist NIS: hanya siswa yang tercatat di Data/SpreadsheetNIS/nis.json
  // (dan kelasnya cocok) yang boleh memilih. Staf/guru dilewatkan (tidak ada di roster NIS).
  if (!isStaff) {
    const check = checkVoterNIS(rawName, rawClass);
    if (!check.ok) {
      let error = 'NIS tidak ditemukan dalam data siswa terdaftar.';
      let code = 'NIS_NOT_REGISTERED';
      if (check.reason === 'CLASS_MISMATCH') {
        // Sengaja tidak menyebutkan kelas asli (check.actualClass) di pesan
        // yang dikirim ke client, supaya tidak membocorkan info kelas siswa lain.
        error = 'NIS ditemukan, tetapi tidak sesuai dengan kelas yang dipilih. Periksa kembali kelas Anda.';
        code = 'NIS_CLASS_MISMATCH';
      } else if (check.reason === 'ROSTER_UNAVAILABLE') {
        error = 'Data siswa (roster NIS) belum tersedia di server. Hubungi panitia/admin.';
        code = 'ROSTER_UNAVAILABLE';
      }

      // Catat ke live alert (bisa di-dismiss) DAN ke log permanen (tidak pernah
      // dihapus otomatis, buat audit) di Datastore. Panitia lihat lintas device.
      const alertEntry = {
        id: 'AL-' + Math.floor(100000 + Math.random() * 900000),
        type: 'roster',
        name: maskId(rawName),
        class: rawClass || '—',
        booth: (body.booth || '-').toString().slice(0, 4),
        time: jakartaTime(),
        createdAt: Date.now(),
        reasonText: error,
      };
      try { await store.addLiveAlert(alertEntry); } catch (e) {}
      try { await store.pushAlertLog(alertEntry); } catch (e) {}

      res.status(403).json({ ok: false, error, code });
      return;
    }
  }

  const receipt = 'PM-' + Math.floor(100000 + Math.random() * 900000);
  const timestamp = Date.now();
  const entry = {
    receipt,
    name: cleanName(rawName), // Menggunakan nama asli
    class: (body.class || '-').toString().slice(0, 24),
    booth: (body.booth || '-').toString().slice(0, 4),
    time: jakartaTime(),
    timestamp,
    ts: timestamp,
  };

  try {
    const result = await store.recordVote(rawName, candidate, entry);
    if (!result.created) {
      const alertEntry = {
        id: 'AL-' + Math.floor(100000 + Math.random() * 900000),
        type: 'duplicate',
        name: maskId(rawName),
        class: entry.class,
        booth: entry.booth,
        time: jakartaTime(),
        createdAt: Date.now(),
      };
      try { await store.addLiveAlert(alertEntry); } catch (e) {}
      try { await store.pushAlertLog(alertEntry); } catch (e) {}
      res.status(409).json({
        ok: false,
        error: 'NIS atau identitas ini sudah memberikan suara.',
        code: 'DUPLICATE_VOTER',
      });
      return;
    }
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: 'Gagal menyimpan suara. Di Vercel: aktifkan Storage KV (Upstash).',
    });
    return;
  }

  res.status(200).json({ ok: true, receipt });
};
