// POST /api/vote  { candidate, name, class, booth, receipt?, action? }
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
    const rawName = (body.name || '').toString().trim();
    const rawClass = (body.class || '').toString();
    const isStaff = rawClass === 'Guru/Karyawan';

    if (!rawName) {
      res.status(400).json({ ok: false, error: 'NIS atau identitas pemilih wajib diisi.' });
      return;
    }

    // --- FITUR TAMBAHAN: CEK DUPLIKAT DI AWAL (MENGGANTIKAN check.js) ---
    if (body.action === 'check') {
      // 1. Cek Roster Terlebih Dahulu
      if (!isStaff) {
        const check = checkVoterNIS(rawName, rawClass);
        if (!check.ok) {
          let error = 'NIS tidak ditemukan dalam data siswa terdaftar.';
          let code = 'NIS_NOT_REGISTERED';
          if (check.reason === 'CLASS_MISMATCH') {
            error = 'NIS ditemukan, tetapi tidak sesuai dengan kelas yang dipilih.';
            code = 'NIS_CLASS_MISMATCH';
          } else if (check.reason === 'ROSTER_UNAVAILABLE') {
            error = 'Data siswa (roster NIS) belum tersedia di server.';
            code = 'ROSTER_UNAVAILABLE';
          }
          return res.status(403).json({ ok: false, error, code });
        }
      }

      // 2. Cek Apakah Sudah Pernah Voting Sebelumnya via Store
      // Bergantung pada implementasi _store.js, kita cek riwayat pemilih
      const hasVoted = await store.checkHasVoted ? await store.checkHasVoted(rawName) : false;
      if (hasVoted) {
        const safeMaskedName = typeof maskId === 'function' ? maskId(rawName) : rawName;
        const alertEntry = {
          id: 'AL-' + Math.floor(100000 + Math.random() * 900000),
          type: 'duplicate',
          name: safeMaskedName,
          class: rawClass || '—',
          booth: (body.booth || '-').toString().slice(0, 4),
          time: jakartaTime(),
          createdAt: Date.now(),
          reasonText: 'Percobaan login duplikat NIS terdeteksi di awal.',
        };
        try { await store.addLiveAlert(alertEntry); } catch (e) {}
        try { await store.pushAlertLog(alertEntry); } catch (e) {}

        return res.status(409).json({
          ok: false,
          code: 'DUPLICATE_VOTER',
          error: 'NIS ini sudah terdaftar memberikan suara.'
        });
      }

      return res.status(200).json({ ok: true });
    }
    // --- AKHIR FITUR CHECK ---

    const candidate = (body.candidate || '').toString();
    if (!VALID.includes(candidate)) {
      res.status(400).json({ ok: false, error: 'Kandidat tidak valid.' });
      return;
    }

    // Pengecekan Roster untuk Voting Utama
    if (!isStaff) {
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
      name: cleanName(rawName), 
      class: (body.class || '-').toString().slice(0, 24),
      booth: (body.booth || '-').toString().slice(0, 4),
      time: jakartaTime(),
      timestamp,
      ts: timestamp,
    };

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
    console.error("Backend Error:", error);
    res.status(500).json({ 
      ok: false, 
      error: 'Sistem mengalami kendala internal: ' + error.message 
    });
  }
};
