// Whitelist NIS: memvalidasi NIS peserta terhadap data siswa resmi
// (Data/SpreadsheetNIS/nis.json) sebelum vote direkam.
// File diawali "_" -> Vercel tidak menjadikannya route.
const fs = require('fs');
const path = require('path');

const ROSTER_PATH = path.join(process.cwd(), 'Data', 'SpreadsheetNIS', 'nis.json');

// Pemetaan nilai <select> di index.html -> key kelas di nis.json.
// Kalau nama kelas di roster berubah, cukup update di sini.
const CLASS_MAP = {
  'XA': '10 A', 'XB': '10 B', 'XC': '10 C', 'XD': '10 D',
  'XE': '10 E', 'XF': '10 F', 'XG': '10 G', 'XH': '10 H',
  'XI IPA 1': '11 IPA 1', 'XI IPA 2': '11 IPA 2', 'XI IPA 3': '11 IPA 3',
  'XI IPA 4': '11 IPA 4', 'XI IPA 5': '11 IPA 5', 'XI IPA 6': '11 IPA 6',
  'XI IPS 1': '11 IPS 1', 'XI IPS 2': '11 IPS 2', 'XI IPS 3': '11 IPS 3',
  'XII Teknik 1': '12 Teknik 1', 'XII Teknik 2': '12 Teknik 2',
  'XII Kesehatan 1': '12 Kesehatan 1', 'XII Kesehatan 2': '12 Kesehatan 2',
  'XII Sosial 1': '12 Sosial 1', 'XII Sosial 2': '12 Sosial 2',
};

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

  const expectedClass = CLASS_MAP[uiClassName];
  if (expectedClass && actualClass !== expectedClass) {
    return { ok: false, reason: 'CLASS_MISMATCH', actualClass };
  }

  return { ok: true };
}

module.exports = { checkVoterNIS, loadRoster, clearRosterCache, CLASS_MAP };
