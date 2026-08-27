// Storage abstraction: pakai Redis KV kalau dikonfigurasi (Vercel),
// jatuh ke file JSON lokal (data/db.json) kalau tidak.
//
// - Vercel serverless: filesystem read-only -> WAJIB pakai KV.
// - Lokal / server sendiri (node / vercel dev): file db.json jalan, data
//   tersimpan di folder proyek. Ini yang cocok kalau mau "file as database".
const fs = require('fs');
const path = require('path');
const { kv, kvConfigured } = require('./_lib');

const FILE = path.join(process.cwd(), 'data', 'db.json');

function readFileDb() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { votes: db.votes || {}, activity: db.activity || [] };
  } catch (e) {
    return { votes: {}, activity: [] };
  }
}

function writeFileDb(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE); // tulis atomik (mengurangi risiko korup)
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

async function reset() {
  if (kvConfigured()) {
    await kv('DEL', 'pemira:votes', 'pemira:total', 'pemira:activity');
    return;
  }
  writeFileDb({ votes: {}, activity: [] });
}

module.exports = { incrVote, pushActivity, getCounts, getActivity, reset, usingKv: kvConfigured };
