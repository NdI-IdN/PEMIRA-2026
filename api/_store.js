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
    return { votes: db.votes || {}, activity: db.activity || [], voters: db.voters || {} };
  } catch (e) {
    return { votes: {}, activity: [], voters: {} };
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
    await kv('DEL', 'pemira:votes', 'pemira:total', 'pemira:activity', VOTER_KEYS);
    return;
  }
  writeFileDb({ votes: {}, activity: [], voters: {} });
}

module.exports = { incrVote, pushActivity, recordVote, getCounts, getActivity, findByReceipt, reset, usingKv: kvConfigured };
