// GET /api/health -> diagnosa konfigurasi. Tidak membocorkan nilai secret,
// hanya menandai env mana yang terbaca. Buka di browser: /api/health
const { kvConfigured } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    node: process.version,
    storage: kvConfigured() ? 'kv' : 'file',
    env: {
      KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
      ADMIN_USERNAME: Boolean(process.env.ADMIN_USERNAME),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    },
  });
};
