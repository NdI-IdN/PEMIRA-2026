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
  if (req.method === 'GET') {
    try {
      const keys = await kv.keys('booth_status:*');
      const booths = {};
      for (const key of keys) {
        const boothNum = key.split(':')[1];
        const data = await kv.get(key);
        if (data) booths[boothNum] = data;
      }
      return res.status(200).json({ ok: true, booths });
    } catch (e) {
      return res.status(500).json({ ok: false, booths: {} });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = await readBody(req);

    // --- DEKLARASIKAN DI ATAS SUPAYA BISA DIAKSES SEMUA BLOK ---
    const rawName = (body.name || '').toString().trim();
    const rawClass = (body.class || '').toString();
    const isStaff = rawClass === 'Guru/Karyawan';
    // -----------------------------------------------------------

    // --- 1. CEK AWAL (ACTION === 'CHECK') ---
    if (body.action === 'check') {
      if (!rawName) {
        return res.status(400).json({ ok: false, error: 'Identitas wajib diisi.' });
      }

      // Cek apakah sudah pernah memilih sebelumnya
      const hasVoted = await store.checkHasVoted ? await store.checkHasVoted(rawName) : false;
      if (hasVoted) {
        return res.status(409).json({ ok: false, code: 'DUPLICATE_VOTER', error: 'Identitas ini sudah terdaftar memberikan suara.' });
      }

      // Kalau guru/karyawan, langsung loloskan tanpa cek roster NIS siswa
      if (isStaff) {
        return res.status(200).json({ ok: true });
      }

      // Cek roster untuk siswa biasa
      const check = checkVoterNIS(rawName, rawClass);
      if (!check.ok) {
        return res.status(403).json({ ok: false, error: 'NIS tidak valid atau tidak sesuai kelas.', code: 'NIS_NOT_REGISTERED' });
      }

      return res.status(200).json({ ok: true });
    }
    // -----------------------------------------------------------------

    // --- 2. VALIDASI KANDIDAT (SAAT PEMILIHAN FINAL) ---
    const candidate = (body.candidate || '').toString();
    if (!VALID.includes(candidate)) {
      return res.status(400).json({ ok: false, error: 'Kandidat tidak valid.' });
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
