// POST /api/vote  { candidate, name, class, booth, receipt? }
// Rekam suara + catat aktivitas dengan satu vote per identity. Storage: KV atau file JSON.
const { readBody, maskId } = require('./_lib');
const store = require('./_store');
const { checkVoterNIS } = require('./_roster');

const VALID = ['1', '2', '3', '4'];

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

  try {
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

    // Pengecekan Roster
    if (!isStaff) {
      // Pastikan checkVoterNIS sinkron (tidak butuh await). Jika di roster.js pakai async, tambahkan await di sini.
      const check = checkVoterNIS(rawName, rawClass);
      
      if (!check.ok) {
        let error = 'NIS tidak ditemukan dalam data siswa terdaftar.';
        let code = 'NIS_NOT_REGISTERED';
        
        if (check.reason === 'CLASS_MISMATCH') {
          error = 'NIS ditemukan, tetapi tidak sesuai dengan kelas yang dipilih. Periksa kembali kelas Anda.';
          code = 'NIS_CLASS_MISMATCH';
        } else if (check.reason === 'ROSTER_UNAVAILABLE') {
          error = 'Data siswa (roster NIS) belum tersedia di server. Hubungi panitia/admin.';
          code = 'ROSTER_UNAVAILABLE';
        }

        // Pengaman: Jika maskId tidak ada di _lib.js, jangan sampai bikin crash
        const safeMaskedName = typeof maskId === 'function' ? maskId(rawName) : rawName;

        const alertEntry = {
          id: 'AL-' + Math.floor(100000 + Math.random() * 900000),
          type: 'roster',
          name: safeMaskedName, 
          class: rawClass || '—',
          booth: (body.booth || '-').toString().slice(0, 4),
          time: jakartaTime(),
          createdAt: Date.now(),
          reasonText: error,
        };

        // Tunggu proses penyimpanan log ke database selesai sebelum return
        try { await store.addLiveAlert(alertEntry); } catch (e) { console.error("Gagal save LiveAlert", e); }
        try { await store.pushAlertLog(alertEntry); } catch (e) { console.error("Gagal save AlertLog", e); }

        // Sekarang Vercel akan berhasil me-return JSON ini ke frontend
        res.status(403).json({ ok: false, error, code });
        return;
      }
    }

    const receipt = 'PM-' + Math.floor(100000 + Math.random() * 900000);
    const timestamp = Date.now();
    const entry = {
      receipt,
      name: cleanName(rawName), 
      class: (body.class || '-').toString().slice(0, 24),
      booth: (body.booth || '-').toString().slice(0, 4),
      time: jakartaTime(),
      timestamp,
      ts: timestamp,
    };

    // Proses rekam suara
    const result = await store.recordVote(rawName, candidate, entry);
    if (!result.created) {
      const safeMaskedName = typeof maskId === 'function' ? maskId(rawName) : rawName;
      const alertEntry = {
        id: 'AL-' + Math.floor(100000 + Math.random() * 900000),
        type: 'duplicate',
        name: safeMaskedName,
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

    res.status(200).json({ ok: true, receipt });

  } catch (error) {
    // JIKA TERJADI CRASH (BUGS), FRONTEND AKAN MENDAPATKAN PESAN ERROR ASLINYA
    console.error("Backend Error:", error);
    res.status(500).json({ 
      ok: false, 
      error: 'Sistem mengalami kendala internal: ' + error.message 
    });
  }
};
