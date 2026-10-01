// POST   /api/vote  { candidate, name, class, booth, receipt?, action? }
// DELETE /api/vote  { receipt, candidate? } -> hapus 1 suara berdasarkan kode receipt (khusus panitia login)
//   candidate wajib diberikan karena entri activity tidak menyimpan pilihan (kerahasiaan suara).
const { readBody, maskId, getSessionUser, kv, kvConfigured } = require('./_lib');
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

// ---- Status bilik (ping dari kiosk tiap beberapa detik) ----
const localBooths = {}; // fallback kalau KV tidak dikonfigurasi (jalan lokal)
async function setBoothStatus(booth, status) {
  const rec = { status: status === 'Terpakai' ? 'Terpakai' : 'Standby', lastPing: Date.now() };
  if (kvConfigured()) await kv('SET', 'booth_status:' + booth, JSON.stringify(rec), 'EX', '120');
  else localBooths[booth] = rec;
}
async function getBooths() {
  if (!kvConfigured()) return { ...localBooths };
  const booths = {};
  const keys = await kv('KEYS', 'booth_status:*');
  if (Array.isArray(keys)) {
    for (const key of keys) {
      const raw = await kv('GET', key);
      try { if (raw) booths[key.split(':')[1]] = JSON.parse(raw); } catch (e) {}
    }
  }
  return booths;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const booths = await getBooths();
      return res.status(200).json({ ok: true, booths });
    } catch (e) {
      return res.status(500).json({ ok: false, booths: {} });
    }
  }

  if (req.method === 'DELETE') {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    try {
      const body = await readBody(req);
      const receipt = String(body.receipt || '').trim().toUpperCase();
      if (!/^PM-\d{6}$/.test(receipt)) {
        return res.status(400).json({ ok: false, error: 'Format receipt tidak valid (contoh: PM-123456).' });
      }
      let candidate;
      if (body.candidate !== undefined && body.candidate !== null && body.candidate !== '') {
        candidate = String(body.candidate);
        if (!VALID.includes(candidate)) return res.status(400).json({ ok: false, error: 'Nomor paslon tidak valid (1-4).' });
      }
      const result = await store.deleteSingleVote(receipt, candidate);
      if (!result || !result.success) {
        return res.status(result && result.needCandidate ? 422 : 404).json({
          ok: false,
          needCandidate: !!(result && result.needCandidate),
          error: (result && result.message) || 'Receipt tidak ditemukan.',
        });
      }
      // Jejak audit di Log Peringatan
      try {
        const auditEntry = {
          id: 'AL-' + Math.floor(100000 + Math.random() * 900000),
          type: 'audit',
          name: 'Panitia',
          class: '—',
          booth: '-',
          time: jakartaTime(),
          createdAt: Date.now(),
          reasonText: 'Suara dengan receipt ' + receipt + ' dihapus oleh panitia.',
        };
        await store.pushAlertLog(auditEntry);
      } catch (e) {}
      return res.status(200).json({ ok: true, deleted: true, receipt });
    } catch (e) {
      console.error('Delete vote error:', e);
      return res.status(500).json({ ok: false, error: 'Gagal menghapus suara: ' + e.message });
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

    // --- PING STATUS BILIK (bukan suara, tidak ikut diblokir saat pemilihan ditutup) ---
    if (body.status !== undefined && body.candidate === undefined && !body.action) {
      const booth = (body.booth || '-').toString().slice(0, 4);
      try { await setBoothStatus(booth, body.status); } catch (e) {}
      return res.status(200).json({ ok: true });
    }

    // --- 0. PEMILIHAN DITUTUP? (server-side, tidak bisa dibypass dari client) ---
    // Berlaku untuk verifikasi (check) dan pengiriman suara; ping status bilik tidak ikut diblokir.
    if (body.action === 'check' || body.candidate !== undefined) {
      const cfg = await store.getConfig();
      if (cfg && cfg.votingClosed) {
        return res.status(403).json({ ok: false, closed: true, code: 'VOTING_CLOSED', error: 'Pemilihan sudah ditutup.' });
      }
    }
    // -----------------------------------------------------------------------------

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
