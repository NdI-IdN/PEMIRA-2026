// Whitelist NIS: memvalidasi NIS peserta terhadap data siswa resmi
// (Data/SpreadsheetNIS/nis.json) sebelum vote direkam.
// File diawali "_" -> Vercel tidak menjadikannya route.
const fs = require('fs');
const path = require('path');

const ROSTER_PATH = path.join(process.cwd(), 'Data', 'nis.json');

// Key kelas di nis.json memakai format yang sama persis dengan value
// <option> di index.html ("XA", "XI IPA 1", "XII Teknik 1", dst),
// jadi tidak perlu tabel terjemahan terpisah.

let cache = null; // Map<nis, kelasRoster>

function loadRoster() {
  if (cache) return cache;
  const byNis = new Map();
  try {
    const raw = fs.readFileSync(ROSTER_PATH, 'utf8');
    const data = JSON.parse(raw);
    for (const kelasDict of Object.values(data)) {
      for (const [kelas, list] of Object.entries(kelasDict)) {
        for (const nis of list) {
          const key = String(nis).trim();
          if (key) byNis.set(key, kelas);
        }
      }
    }
  } catch (e) {
    // Roster belum ada / gagal dibaca -> Map kosong, ditangani oleh caller.
  }
  cache = byNis;
  return cache;
}

// Dipakai saat testing/reload manual (roster berubah tanpa redeploy fungsi).
function clearRosterCache() {
  cache = null;
}

// Mengembalikan:
//  { ok: true }                                   - NIS & kelas cocok
//  { ok: false, reason: 'ROSTER_UNAVAILABLE' }     - file roster tidak ada/kosong
//  { ok: false, reason: 'NOT_FOUND' }               - NIS tidak terdaftar sama sekali
//  { ok: false, reason: 'CLASS_MISMATCH', actualClass }
function checkVoterNIS(nis, uiClassName) {
  const roster = loadRoster();
  if (!roster.size) {
    return { ok: false, reason: 'ROSTER_UNAVAILABLE' };
  }

  const cleanNis = String(nis || '').trim();
  const actualClass = roster.get(cleanNis);
  if (!actualClass) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const expectedClass = uiClassName;
  if (expectedClass && actualClass !== expectedClass) {
    return { ok: false, reason: 'CLASS_MISMATCH', actualClass };
  }

  return { ok: true };
}

module.exports = { checkVoterNIS, loadRoster, clearRosterCache };
