// GET /api/me  -> { authenticated, username }
const { getSessionUser } = require('./_lib');

module.exports = async (req, res) => {
  const username = getSessionUser(req);
  if (!username) {
    res.status(200).json({ authenticated: false });
    return;
  }
  res.status(200).json({ authenticated: true, username });
};
