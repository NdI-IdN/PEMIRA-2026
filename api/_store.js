// Storage abstraction: pakai Redis KV kalau dikonfigurasi (Vercel),
// jatuh ke file JSON lokal (data/db.json) kalau tidak.
//
// - Vercel serverless: filesystem read-only -> WAJIB pakai KV.
// - Lokal / server sendiri (node / vercel dev): file db.json jalan, data
//   tersimpan di folder proyek. Ini yang cocok kalau mau "file as database".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { kv, kvConfigured } = require('./_lib');

const FILE = path.join(process.cwd(), 'data', 'db.json');
const VOTER_KEYS = 'pemira:voter-keys';
let fileOperation = Promise.resolve();

function readFileDb() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { votes: db.votes || {}, activity: db.activity || [], voters: db.voters || {}, liveAlerts: db.liveAlerts || {}, alertLog: db.alertLog || [] };
  } catch (e) {
    return { votes: {}, activity: [], voters: {}, liveAlerts: {}, alertLog: [] };
  }
}

function writeFileDb(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE); // tulis atomik (mengurangi risiko korup)
}

function normalizeVoterId(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

function voterKey(value) {
  return `pemira:voter:${crypto.createHash('sha256').update(normalizeVoterId(value)).digest('hex')}`;
}

function withFileLock(operation) {
  const result = fileOperation.then(operation, operation);
  fileOperation = result.catch(() => {});
  return result;
}

async function incrVote(candidate) {
  if (kvConfigured()) {
    await kv('HINCRBY', 'pemira:votes', candidate, 1);
    await kv('INCR', 'pemira:total');
    return;
  }
  const db = readFileDb();
  db.votes[candidate] = (Number(db.votes[candidate]) || 0) + 1;
  writeFileDb(db);
}

async function pushActivity(entry) {
  if (kvConfigured()) {
    await kv('LPUSH', 'pemira:activity', JSON.stringify(entry));
    await kv('LTRIM', 'pemira:activity', '0', '199');
    return;
  }
  const db = readFileDb();
  db.activity.unshift(entry);
  db.activity = db.activity.slice(0, 200);
  writeFileDb(db);
}

async function recordVote(identity, candidate, entry) {
  const normalizedIdentity = normalizeVoterId(identity);
  if (!normalizedIdentity) return { created: false };

  if (kvConfigured()) {
    const key = voterKey(normalizedIdentity);

    // Menolak data lama yang sudah ada walaupun belum mempunyai index voter.
    const existing = await kv('LRANGE', 'pemira:activity', '0', '-1');
    if (Array.isArray(existing) && existing.some((raw) => {
      try {
        const saved = JSON.parse(raw);
        return normalizeVoterId(saved.name) === normalizedIdentity;
      } catch (e) {
        return false;
      }
    })) {
      return { created: false };
    }

    // SET NX bersifat atomik di Redis: hanya satu perangkat yang bisa menang.
    const claimed = await kv('SET', key, entry.receipt, 'NX');
    if (claimed !== 'OK') return { created: false };

    try {
      await kv('SADD', VOTER_KEYS, key);
      await incrVote(candidate);
      await pushActivity(entry);
    } catch (e) {
      // Lepaskan claim bila penyimpanan gagal sebelum request selesai.
      try {
        await kv('DEL', key);
        await kv('SREM', VOTER_KEYS, key);
      } catch (cleanupError) {}
      throw e;
    }
    return { created: true };
  }

  // File fallback tetap aman terhadap dua request bersamaan dalam satu proses Node.
  return withFileLock(() => {
    const db = readFileDb();
    const duplicate = Object.keys(db.voters).some((savedKey) => savedKey === voterKey(normalizedIdentity))
      || db.activity.some((saved) => normalizeVoterId(saved.name) === normalizedIdentity);
    if (duplicate) return { created: false };

    db.voters[voterKey(normalizedIdentity)] = entry.receipt;
    db.votes[candidate] = (Number(db.votes[candidate]) || 0) + 1;
    db.activity.unshift(entry);
    db.activity = db.activity.slice(0, 200);
    writeFileDb(db);
    return { created: true };
  });
}

async function getCounts() {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (kvConfigured()) {
    const flat = await kv('HGETALL', 'pemira:votes');
    if (Array.isArray(flat)) {
      for (let i = 0; i < flat.length; i += 2) counts[flat[i]] = Number(flat[i + 1]) || 0;
    }
    return counts;
  }
  const db = readFileDb();
  for (const k of [1, 2, 3, 4]) counts[k] = Number(db.votes[k]) || 0;
  return counts;
}

async function getActivity(n) {
  if (kvConfigured()) {
    const raw = await kv('LRANGE', 'pemira:activity', '0', String(n - 1));
    if (!Array.isArray(raw)) return [];
    return raw.map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  }
  return readFileDb().activity.slice(0, n);
}

async function findByReceipt(receipt) {
  const normalizedReceipt = String(receipt || '').trim().toUpperCase();
  if (!normalizedReceipt) return null;

  const activity = kvConfigured()
    ? await kv('LRANGE', 'pemira:activity', '0', '-1')
    : readFileDb().activity;

  if (!Array.isArray(activity)) return null;
  for (const item of activity) {
    const saved = typeof item === 'string'
      ? (() => { try { return JSON.parse(item); } catch (e) { return null; } })()
      : item;
    if (saved && String(saved.receipt || '').trim().toUpperCase() === normalizedReceipt) {
      return saved;
    }
  }
  return null;
}

async function reset() {
  if (kvConfigured()) {
    const voterKeys = await kv('SMEMBERS', VOTER_KEYS);
    if (Array.isArray(voterKeys) && voterKeys.length) await kv('DEL', ...voterKeys);
    // pemira:alert-log SENGAJA tidak ikut dihapus - log peringatan harus tetap
    // permanen walaupun data vote di-reset untuk pemilihan baru.
    await kv('DEL', 'pemira:votes', 'pemira:total', 'pemira:activity', VOTER_KEYS, ACTIVE_ALERTS_KEY);
    return;
  }
  // alertLog SENGAJA dipertahankan (bukan ikut di-reset) - lihat komentar di atas.
  const db = readFileDb();
  writeFileDb({ votes: {}, activity: [], voters: {}, liveAlerts: {}, alertLog: db.alertLog || [] });
}

// ---------- Live alerts AKTIF (stack, bisa lebih dari satu bersamaan) ----------
// Disimpan sebagai HASH (id -> alert JSON) di Datastore, supaya panitia di
// device manapun melihat SEMUA alert yang belum di-dismiss, bukan cuma 1 slot
// yang saling menimpa. Setiap alert bisa di-dismiss satu-satu lewat id-nya.
const ACTIVE_ALERTS_KEY = 'pemira:live-alerts-active';

async function addLiveAlert(alert) {
  if (kvConfigured()) {
    await kv('HSET', ACTIVE_ALERTS_KEY, alert.id, JSON.stringify(alert));
    return;
  }
  const db = readFileDb();
  db.liveAlerts = db.liveAlerts || {};
  db.liveAlerts[alert.id] = alert;
  writeFileDb(db);
}

async function getLiveAlerts() {
  if (kvConfigured()) {
    const flat = await kv('HGETALL', ACTIVE_ALERTS_KEY);
    const out = [];
    if (Array.isArray(flat)) {
      for (let i = 0; i < flat.length; i += 2) {
        try { out.push(JSON.parse(flat[i + 1])); } catch (e) {}
      }
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return out;
  }
  const db = readFileDb();
  const map = db.liveAlerts || {};
  return Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function dismissLiveAlert(id) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return;
  if (kvConfigured()) {
    await kv('HDEL', ACTIVE_ALERTS_KEY, cleanId);
    return;
  }
  const db = readFileDb();
  if (db.liveAlerts) delete db.liveAlerts[cleanId];
  writeFileDb(db);
}

// ---------- Log peringatan PERMANEN ----------
// Berbeda dari live alert (yang cuma 1 slot & bisa di-dismiss/hilang), setiap
// kejadian di sini TETAP tercatat selamanya untuk keperluan audit, walaupun
// live alert-nya sudah di-dismiss oleh panitia. Tidak ada TTL/trim otomatis.
const ALERT_LOG_KEY = 'pemira:alert-log';

async function pushAlertLog(entry) {
  if (kvConfigured()) {
    await kv('LPUSH', ALERT_LOG_KEY, JSON.stringify(entry));
    return;
  }
  const db = readFileDb();
  db.alertLog = db.alertLog || [];
  db.alertLog.unshift(entry);
  writeFileDb(db);
}

async function getAlertLog(n) {
  if (kvConfigured()) {
    const end = n ? String(n - 1) : '-1';
    const raw = await kv('LRANGE', ALERT_LOG_KEY, '0', end);
    if (!Array.isArray(raw)) return [];
    return raw.map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  }
  const db = readFileDb();
  const log = db.alertLog || [];
  return n ? log.slice(0, n) : log;
}

module.exports = {
  incrVote, pushActivity, recordVote, getCounts, getActivity, findByReceipt, reset, usingKv: kvConfigured,
  addLiveAlert, getLiveAlerts, dismissLiveAlert, pushAlertLog, getAlertLog,
};
