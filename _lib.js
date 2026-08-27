// Shared helpers untuk semua serverless function.
// File diawali "_" -> Vercel tidak menjadikannya route.
const crypto = require('crypto');

const COOKIE_NAME = 'pemira_session';
const SESSION_HOURS = 8;

// ---------- KV (Upstash Redis via REST) ----------
// Otomatis terisi saat menambah storage "KV / Upstash Redis" di Vercel > Storage.
// Integrasi memakai salah satu skema nama env berikut — dukung keduanya.
function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}
function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
}
function kvConfigured() {
  return Boolean(kvUrl() && kvToken());
}

async function kv(...command) {
  if (!kvConfigured()) throw new Error('KV_NOT_CONFIGURED');
  const res = await fetch(kvUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

// ---------- Body & cookie parsing ----------
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  // Fallback: baca stream manual.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return {}; }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// ---------- Signed session cookie (HMAC-SHA256) ----------
function secret() {
  return process.env.SESSION_SECRET || 'dev-insecure-secret-ganti-di-produksi';
}

function hmac(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

function makeToken(username) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = `${username}|${exp}`;
  const sig = hmac(payload);
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  let payload;
  try { payload = Buffer.from(b64, 'base64url').toString('utf8'); } catch (e) { return null; }
  const expected = hmac(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [username, exp] = payload.split('|');
  if (!exp || Date.now() > Number(exp)) return null;
  return username;
}

function isSecure(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').toString();
  const host = (req.headers.host || '').toString();
  if (proto.includes('https')) return true;
  return !/localhost|127\.0\.0\.1/.test(host);
}

function setSessionCookie(req, res, username) {
  const parts = [
    `${COOKIE_NAME}=${makeToken(username)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_HOURS * 3600}`,
  ];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getSessionUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  return verifyToken(token);
}

// ---------- Timing-safe credential compare ----------
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = {
  kv,
  kvConfigured,
  readBody,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
  safeEqual,
  COOKIE_NAME,
};
