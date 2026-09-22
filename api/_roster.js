// Whitelist NIS & NIP: memvalidasi NIS/NIP peserta terhadap data resmi
// (Data/nis_only.json dan Data/nip_only.json) sebelum vote direkam.
// File diawali "_" -> Vercel tidak menjadikannya route.
const fs = require('fs');
const path = require('path');

const NIS_ROSTER_PATH = path.join(process.cwd(), 'Data', 'nis.json');
const NIP_ROSTER_PATH = path.join(process.cwd(), 'Data', 'nip.json');

let cache = null; // { nisMap: Map<nis, kelasRoster>, nipSet: Set<nip> }

function loadRoster() {
  if (cache) return cache;
  
  const nisMap = new Map();
  const nipSet = new Set();

  // Load NIS Data
  try {
    const rawNis = fs.readFileSync(NIS_ROSTER_PATH, 'utf8');
    const nisData = JSON.parse(rawNis);
    for (const kelasDict of Object.values(nisData)) {
      for (const [kelas, list] of Object.entries(kelasDict)) {
        for (const nis of list) {
          const key = String(nis).trim();
          if (key) nisMap.set(key, kelas);
        }
      }
    }
  } catch (e) {
    // Roster NIS belum ada / gagal dibaca
  }

  // Load NIP Data
  try {
    const rawNip = fs.readFileSync(NIP_ROSTER_PATH, 'utf8');
    const nipData = JSON.parse(rawNip);
    // Mendukung struktur array langsung atau di dalam objek GuruKaryawan
    const nipList = Array.isArray(nipData) ? nipData : (nipData.GuruKaryawan || []);
    for (const nip of nipList) {
      const key = String(nip).trim();
      if (key) nipSet.add(key);
    }
  } catch (e) {
    // Roster NIP belum ada / gagal dibaca
  }

  cache = { nisMap, nipSet };
  return cache;
}

// Dipakai saat testing/reload manual (roster berubah tanpa redeploy fungsi).
function clearRosterCache() {
  cache = null;
}

// Validasi NIS (Siswa)
function checkVoterNIS(nis, uiClassName) {
  const { nisMap } = loadRoster();
  if (!nisMap.size) {
    return { ok: false, reason: 'ROSTER_UNAVAILABLE' };
  }

  const cleanNis = String(nis || '').trim();
  const actualClass = nisMap.get(cleanNis);
  if (!actualClass) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const expectedClass = uiClassName;
  if (expectedClass && actualClass !== expectedClass) {
    return { ok: false, reason: 'CLASS_MISMATCH', actualClass };
  }

  return { ok: true };
}

// Validasi NIP (Guru & Karyawan)
function checkVoterNIP(nip) {
  const { nipSet } = loadRoster();
  if (!nipSet.size) {
    return { ok: false, reason: 'ROSTER_UNAVAILABLE' };
  }

  const cleanNip = String(nip || '').trim();
  if (!nipSet.has(cleanNip)) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  return { ok: true };
}

module.exports = { checkVoterNIS, checkVoterNIP, loadRoster, clearRosterCache };
