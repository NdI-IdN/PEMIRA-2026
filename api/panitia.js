// GET /api/panitia -> Halaman admin panitia terpisah (login + dashboard).
const { getSessionUser } = require('./_lib');
const store = require('./_store');

const SETTINGS_STORAGE_KEY = 'pemira-settings-v1';
const LIVE_ALERT_KEY = 'pemira-live-alert-v1';

const BASE_STYLE = `
  :root {
    --navy: #202936; --ink: #2d3540; --muted: #77766f; --line: rgba(91,76,54,.18);
    --bg: #eee9df; --white: #ffffff; --blue: #9a6b3d; --blue-soft: #f2e8d6;
    --mint: #5e7d72; --mint-soft: #e4eee9; --orange: #b97945; --orange-soft: #f5e5d5;
    --red: #a95356; --shadow: 0 24px 70px rgba(55,45,31,.16); --radius: 20px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--ink); background: var(--bg);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  button, input { font: inherit; }
  button { cursor: pointer; border: 0; }
  h1, h2, h3, p { margin: 0; }
  .muted { color: var(--muted); }
  .eyebrow { color: var(--blue); font-size: 11px; letter-spacing: .12em; font-weight: 850; text-transform: uppercase; }
  .btn { padding: 12px 17px; border-radius: 11px; color: var(--navy); background: #eef1f8; font-size: 12px; font-weight: 850; transition: .18s ease; }
  .btn:hover { transform: translateY(-1px); filter: brightness(.98); }
  .btn.primary { color: #fff; background: linear-gradient(115deg,#b17b46,#86572f 58%,#4e8277); box-shadow: 0 10px 24px rgba(120,78,39,.28); }
  .btn.dark { color: #fff; background: linear-gradient(115deg,#303947,#202936); }
  .btn.full { width: 100%; padding: 15px; font-size: 13px; }
  .panel { background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 12px 38px rgba(55,45,31,.08); }
  .panel-head { padding: 21px 23px; border-bottom: 1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap: 12px; }
  .panel-body { padding: 22px 23px; }
`;

function loginPageHtml(error) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Masuk Panitia — PEMIRA</title>
  <style>
    ${BASE_STYLE}
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
    .card { width: min(400px, 100%); background: #fff; border: 1px solid var(--line); border-radius: 22px; padding: 32px; box-shadow: var(--shadow); }
    .brand-mark { width: 58px; height: 58px; display: grid; place-items: center; color: #fff6e5; border-radius: 18px; margin: 0 auto 18px; background: linear-gradient(135deg,#bd9055,#79522f); box-shadow: 0 10px 26px rgba(105,72,39,.30); font-size: 24px; }
    .card h1 { font-size: 22px; letter-spacing: -.03em; text-align: center; margin-top: 10px; }
    .card > .eyebrow { text-align: center; display: block; }
    .form-label { display:block; font-size:11px; font-weight:850; color:#546383; margin: 18px 0 8px; }
    input { width:100%; border:1px solid var(--line); background:#fbfcff; color:var(--ink); border-radius:11px; padding:14px; outline: none; font-size:13px; }
    input:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-soft); }
    .login-error { color:#c25768; font-size:11px; font-weight:800; min-height:16px; margin-top:12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="brand-mark">♙</div>
      <div class="eyebrow">Area terbatas</div>
      <h1>Masuk sebagai panitia</h1>
      <form id="loginForm">
        <label class="form-label" for="username">Username admin</label>
        <input id="username" name="username" type="text" placeholder="Masukkan username" autocomplete="username" autofocus />
        <label class="form-label" for="password">Password admin</label>
        <input id="password" name="password" type="password" placeholder="Masukkan password" autocomplete="current-password" />
        <div id="loginError" class="login-error">${error ? escapeHtml(error) : ''}</div>
        <button id="submitBtn" type="submit" class="btn primary full" style="margin-top:6px">Masuk</button>
      </form>
    </div>
  </div>
  <script>
    const form = document.getElementById('loginForm');
    const errorBox = document.getElementById('loginError');
    const submitBtn = document.getElementById('submitBtn');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      errorBox.textContent = '';
      if (!username || !password) { errorBox.textContent = 'Isi username dan password.'; return; }
      submitBtn.disabled = true;
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        let data = null;
        try { data = await res.json(); } catch (err) {}
        if (!res.ok || !data || !data.ok) {
          errorBox.textContent = (data && data.error) || 'Kredensial salah.';
          submitBtn.disabled = false;
          return;
        }
        location.reload();
      } catch (err) {
        errorBox.textContent = 'Gagal menghubungi server.';
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function maskName(name) {
  const str = String(name || '').trim();
  if (str.length < 10) return str;
  return str.slice(0, 3) + '******' + str.slice(-1);
}

function activityRowsHtml(list, limit) {
  const rows = limit ? list.slice(0, limit) : list;
  if (!rows.length) {
    return '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">Belum ada data.</td></tr>';
  }
  return rows.map(a =>
    `<tr><td><div class="person">${escapeHtml(maskName(a.name))}</div></td><td>${escapeHtml(a.class || '-')}</td><td><span class="badge green">Sudah memilih</span></td><td>${escapeHtml(a.time || '')}</td><td>Bilik ${escapeHtml(String(a.booth || '-'))}</td></tr>`
  ).join('');
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function dashboardHtml(activity) {
  const candidates = [
    { id: 1, initials: 'AR', name: 'Alya Rahma' },
    { id: 2, initials: 'BM', name: 'Bagas Mahendra' },
    { id: 3, initials: 'CN', name: 'Citra Nabila' },
    { id: 4, initials: 'DP', name: 'Dimas Pratama' },
  ];

  const resultRowsHtml = candidates.map(c => `
    <div class="result-row">
      <div class="result-avatar a${c.id}">${c.initials}</div>
      <div><span>${c.name}</span><div class="result-track"><i style="width:0%"></i></div></div>
      <strong>0</strong>
    </div>`).join('');

  const boothsHtml = [1, 2, 3, 4, 5].map(n => `
    <div class="booth" data-booth="${n}">
      <div class="booth-head"><span class="booth-number">0${n}</span><span class="booth-icon">✓</span></div>
      <p>Tersedia</p>
      <div class="bar"><i style="width:0%"></i></div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dashboard Panitia — PEMIRA</title>
  <style>
    ${BASE_STYLE}
    .topbar { height: 76px; padding: 0 34px; background: rgba(255,252,244,.85); backdrop-filter: blur(18px); border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 850; letter-spacing: -.03em; }
    .brand-mark { width: 40px; height: 40px; display: grid; place-items: center; color: #fff6e5; border-radius: 13px; background: linear-gradient(135deg,#bd9055,#79522f); box-shadow: 0 10px 26px rgba(105,72,39,.30); font-size: 18px; }
    .brand small { display: block; color: var(--muted); font-weight: 600; letter-spacing: 0; font-size: 11px; margin-top: 2px; }
    main { max-width: 1400px; margin: 0 auto; padding: 34px; }
    .hero { display:flex; align-items:flex-end; justify-content:space-between; gap: 20px; margin: 18px 0 28px; flex-wrap: wrap; }
    .hero p { margin-top: 11px; font-size: 14px; color: var(--muted); max-width: 630px; line-height: 1.6; }
    h1 { font-size: clamp(26px, 3.6vw, 38px); letter-spacing: -.05em; line-height: 1.05; background:linear-gradient(110deg,#202936 15%,#8b6037 62%,#3e746d); -webkit-background-clip:text; background-clip:text; color:transparent; }
    h2 { font-size: 22px; letter-spacing: -.035em; }
    h3 { font-size: 15px; letter-spacing: -.02em; }
    .pill { display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border-radius: 99px; font-weight: 800; font-size: 11px; color: #128264; background: var(--mint-soft); }
    .dot { width: 7px; height: 7px; background: currentColor; border-radius: 50%; display: inline-block; }
    .admin-actions { display:flex; gap:8px; align-items:center; }
    .admin-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
    .stat { padding:18px 19px; background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); }
    .stat-top { display:flex; justify-content:space-between; align-items:center; color:var(--muted); font-size:11px; font-weight:800; }
    .stat-icon { width:31px; height:31px; display:grid; place-items:center; border-radius:10px; background:var(--blue-soft); color:var(--blue); font-size:15px; }
    .stat strong { display:block; margin-top:13px; font-size:27px; letter-spacing:-.05em; }
    .stat small { color:var(--mint); font-weight:800; font-size:10px; }
    .two-col { display:grid; grid-template-columns:1.25fr .75fr; gap:20px; margin-bottom:20px; }
    .booths { display:grid; grid-template-columns:repeat(5,1fr); gap:9px; }
    .booth { padding:14px 12px; border-radius:14px; background: var(--white); border: 1px solid var(--line); }
    .booth-head { display:flex; align-items:center; justify-content:space-between; }
    .booth-number { font-size:17px; font-weight:900; }
    .booth-icon { width:29px; height:29px; display:grid; place-items:center; border-radius:9px; background:var(--mint-soft); color:var(--mint); font-size:14px; }
    .booth p { color:var(--muted); font-size:10px; margin-top:10px; }
    .booth .bar { height:4px; background:#ecf0f7; border-radius:9px; margin-top:13px; overflow:hidden; }
    .booth .bar i { display:block; height:100%; background:var(--mint); border-radius:9px; }
    .result { display:grid; gap:14px; }
    .result-row { display:grid; grid-template-columns:42px 1fr 42px; align-items:center; gap:10px; font-size:11px; font-weight:850; }
    .result-avatar { width:34px; height:34px; border-radius:10px; display:grid; place-items:center; color:#fff; font-weight:900; background: var(--blue); }
    .result-avatar.a2 { background:#b97945; } .result-avatar.a3 { background:#5e7d72; } .result-avatar.a4 { background:#8b617d; }
    .result-track { height:8px; border-radius:9px; background:#edf0f6; overflow:hidden; margin-top:5px; }
    .result-track i { display:block; height:100%; border-radius:9px; background:var(--blue); }
    .table-wrap { overflow:auto; max-height:300px; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    th { text-align:left; color:#8792aa; font-size:10px; font-weight:850; padding:12px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--white); }
    td { padding:14px 12px; border-bottom:1px solid #eef1f6; font-weight:650; white-space:nowrap; }
    .badge { border-radius:99px; padding:5px 8px; font-size:9px; font-weight:850; }
    .badge.green { color:#128264; background:var(--mint-soft); }
    .person { display:flex; align-items:center; gap:8px; }
    .toast { position:fixed; right:23px; bottom:23px; background:var(--navy); color:#fff; border-radius:12px; padding:13px 16px; font-size:12px; font-weight:750; box-shadow:var(--shadow); opacity:0; transform:translateY(12px); pointer-events:none; transition:.25s; z-index:20; }
    .toast.show { opacity:1; transform:none; }
    .modal-backdrop { display:none; position:fixed; inset:0; background:rgba(13,21,47,.48); z-index:15; place-items:center; padding:20px; }
    .modal-backdrop.open { display:grid; }
    .modal { width:min(430px,100%); background:#fff; border-radius:20px; padding:26px; box-shadow:var(--shadow); text-align:left; }
    .modal.large-modal { width:min(760px,100%); }
    .modal p { font-size:12px; color:var(--muted); line-height:1.6; margin:9px 0 21px; }
    .modal-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top: 10px; }
    .form-label { display:block; font-size:11px; font-weight:850; color:#546383; margin: 18px 0 8px; }
    input { width:100%; border:1px solid var(--line); background:#fbfcff; color:var(--ink); border-radius:11px; padding:14px; outline: none; font-size:13px; }
    input:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-soft); }
    .settings-saved { min-height:15px; color:var(--mint); font-size:10px; font-weight:800; margin-top:8px; }
    .live-alert { display:flex; align-items:flex-start; gap:13px; margin-bottom:20px; padding:16px 18px; color:#fff8e9; background:linear-gradient(115deg,#283747,#425b58); border:1px solid rgba(189,144,85,.38); border-radius:16px; box-shadow:0 14px 28px rgba(55,45,31,.14); }
    .live-alert-icon { flex:0 0 34px; width:34px; height:34px; display:grid; place-items:center; color:#fff8e9; background:linear-gradient(135deg,#bd9055,#79522f); border-radius:11px; font-size:16px; font-weight:900; }
    .live-alert-content { flex:1; min-width:0; }
    .live-alert-content strong { display:block; font-size:12px; }
    .live-alert-details { display:flex; flex-wrap:wrap; gap:7px 16px; margin-top:7px; color:#e8e0cf; font-size:10px; line-height:1.5; }
    .live-alert-details b { color:#fff8e9; }
    .live-alert-close { flex:0 0 auto; padding:6px 12px; color:#fff; background:var(--red); border-radius:8px; font-size:11px; font-weight:800; }
    .hidden { display:none !important; }
    @media (max-width: 900px) {
      main { padding:24px 18px; } .topbar { padding:0 18px; }
      .two-col { grid-template-columns:1fr; }
      .admin-grid { grid-template-columns:repeat(2,1fr); } .booths { grid-template-columns:repeat(3,1fr); }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">♙</div>
        <div>PANITIA <small>PEMIRA · Nurul Fikri Islamic Senior High School</small></div>
      </div>
      <div class="admin-actions">
        <button id="settingsBtn" class="btn">⚙ Pengaturan</button>
        <button id="logoutBtn" class="btn dark">Keluar</button>
      </div>
    </header>

    <main>
      <div class="hero">
        <div><div class="eyebrow">Panitia · Live monitoring</div><h1 id="dashboardTitle">Dashboard pemilihan.</h1><p>Pantau aktivitas kelima bilik dan data suara dalam satu layar.</p></div>
        <div class="admin-actions"><span class="pill"><span class="dot"></span> Sistem online</span></div>
      </div>

      <div id="liveVoteAlert" class="live-alert hidden" role="status">
        <div class="live-alert-icon">!</div>
        <div class="live-alert-content">
          <strong>Duplikasi NISN terdeteksi!</strong>
          <div class="live-alert-details"><span>NISN: <b id="liveAlertName">—</b></span><span>Kelas: <b id="liveAlertClass">—</b></span><span>Bilik: <b id="liveAlertBooth">—</b></span></div>
          <small class="live-alert-time">Peserta ini mencoba memilih kembali.</small>
        </div>
        <button id="dismissLiveAlertBtn" class="live-alert-close">Hapus Notifikasi</button>
      </div>

      <div class="admin-grid">
        <div class="stat"><div class="stat-top"><span>Total pemilih</span><span class="stat-icon">♙</span></div><strong id="adminTotal">240</strong><small>Data terverifikasi</small></div>
        <div class="stat"><div class="stat-top"><span>Suara masuk</span><span class="stat-icon" style="color:var(--mint);background:var(--mint-soft)">✓</span></div><strong id="adminCount">${activity.length}</strong><small>Pembaruan langsung</small></div>
        <div class="stat"><div class="stat-top"><span>Partisipasi</span><span class="stat-icon" style="color:var(--orange);background:var(--orange-soft)">◔</span></div><strong id="adminPercent">0%</strong><small style="color:var(--orange)">Sedang berlangsung</small></div>
        <div class="stat"><div class="stat-top"><span>Bilik aktif</span><span class="stat-icon" style="color:#9a68dd;background:#f3ecff">▣</span></div><strong id="activeBoothCount">0/5</strong><small style="color:#8d6fc1">Terdeteksi otomatis</small></div>
      </div>

      <div class="two-col">
        <div class="panel"><div class="panel-head"><div><h3>Status 5 bilik</h3></div><button id="refreshBoothsBtn" class="btn">↻ Refresh</button></div><div class="panel-body"><div class="booths">${boothsHtml}</div></div></div>
        <div class="panel"><div class="panel-head"><div><h3>Partisipasi per kelas</h3></div><span class="pill">Live</span></div><div class="panel-body"><div class="result" id="classBreakdownList" style="max-height:220px;overflow:auto;"><p class="muted" style="font-size:11px;padding:12px 0">Belum ada data suara masuk.</p></div></div></div>
      </div>

      <div class="two-col">
        <div class="panel"><div class="panel-head"><div><h3>Hasil sementara</h3></div></div><div class="panel-body"><div class="result" id="resultList">${resultRowsHtml}</div></div></div>
        <div class="panel"><div class="panel-head"><div><h3>Aktivitas terbaru</h3></div></div><div class="panel-body"><div class="table-wrap"><table><tbody id="activityTableBody">${activityRowsHtml(activity, 10)}</tbody></table></div></div></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div><h3>Data peserta</h3></div>
          <button id="viewAllParticipantsBtn" class="btn">Lihat Semua</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>NISN PESERTA</th><th>KELAS</th><th>STATUS</th><th>WAKTU</th><th>BILIK</th></tr></thead>
            <tbody id="participantTableBody">${activityRowsHtml(activity, 10)}</tbody>
          </table>
        </div>
      </div>
    </main>
  </div>

  <div id="toast" class="toast"></div>

  <div id="allParticipantsModal" class="modal-backdrop">
    <div class="modal large-modal">
      <div class="panel-head" style="padding:0 0 16px; margin-bottom:16px; border:0;">
        <h2>Daftar Seluruh Peserta Sudah Memilih</h2>
        <button id="closeAllParticipantsBtn" class="btn">Tutup</button>
      </div>
      <div class="table-wrap" style="max-height:400px;">
        <table>
          <thead><tr><th>NISN PESERTA</th><th>KELAS</th><th>STATUS</th><th>WAKTU</th><th>BILIK</th></tr></thead>
          <tbody id="allParticipantsTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="settingsModal" class="modal-backdrop">
    <div class="modal">
      <div class="eyebrow">Konfigurasi dashboard</div>
      <h2>Pengaturan pemilihan</h2>
      <label class="form-label" for="settingsSessionName">Nama sesi</label>
      <input id="settingsSessionName" type="text" placeholder="PEMIRA 2026" />
      <label class="form-label" for="settingsTotalVoters">Total pemilih</label>
      <input id="settingsTotalVoters" type="number" placeholder="240" />
      <div id="settingsSaved" class="settings-saved"></div>
      <div class="modal-actions"><button class="btn" id="cancelSettingsBtn">Batal</button><button class="btn primary" id="saveSettingsBtn">Simpan</button></div>
    </div>
  </div>

  <script>
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];
    const POLL_MS = 5000;
    const SETTINGS_STORAGE_KEY = ${JSON.stringify(SETTINGS_STORAGE_KEY)};
    const LIVE_ALERT_KEY = ${JSON.stringify(LIVE_ALERT_KEY)};
    const state = { pollTimer: null, allActivityData: [] };

    async function api(path, options) {
      try {
        const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
        let data = null;
        try { data = await res.json(); } catch (e) {}
        return { ok: res.ok, status: res.status, data };
      } catch (e) {
        return { ok: false, status: 0, data: null };
      }
    }

    function showToast(message) {
      const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2800);
    }

    function maskName(name) {
      const str = String(name || '').trim();
      if (str.length < 10) return str;
      return str.slice(0, 3) + '******' + str.slice(-1);
    }

    function readSettings() {
      const defaults = { sessionName: 'PEMIRA 2026', totalVoters: 240 };
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
        return saved || defaults;
      } catch (e) { return defaults; }
    }

    function applySettings() {
      const settings = readSettings();
      if ($('#dashboardTitle')) $('#dashboardTitle').textContent = 'Dashboard ' + settings.sessionName.toLowerCase() + '.';
      if ($('#adminTotal')) $('#adminTotal').textContent = settings.totalVoters;
    }

    function openSettings() {
      const settings = readSettings();
      $('#settingsSessionName').value = settings.sessionName;
      $('#settingsTotalVoters').value = settings.totalVoters;
      $('#settingsSaved').textContent = '';
      $('#settingsModal').classList.add('open');
    }

    function saveSettings() {
      const sessionName = $('#settingsSessionName').value.trim();
      const totalVoters = Number($('#settingsTotalVoters').value);
      if (!sessionName || !totalVoters) return;
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ sessionName, totalVoters }));
      applySettings();
      $('#settingsModal').classList.remove('open');
      showToast('Pengaturan disimpan.');
    }

    $('#settingsBtn').addEventListener('click', openSettings);
    $('#cancelSettingsBtn').addEventListener('click', () => $('#settingsModal').classList.remove('open'));
    $('#saveSettingsBtn').addEventListener('click', saveSettings);

    $('#viewAllParticipantsBtn').addEventListener('click', () => {
      renderAllParticipantsModal();
      $('#allParticipantsModal').classList.add('open');
    });
    $('#closeAllParticipantsBtn').addEventListener('click', () => {
      $('#allParticipantsModal').classList.remove('open');
    });

    $('#dismissLiveAlertBtn').addEventListener('click', () => {
      localStorage.removeItem(LIVE_ALERT_KEY);
      $('#liveVoteAlert').classList.add('hidden');
    });

    function checkLiveAlerts() {
      try {
        const rawAlert = localStorage.getItem(LIVE_ALERT_KEY);
        if (rawAlert) {
          const alertData = JSON.parse(rawAlert);
          $('#liveAlertName').textContent = alertData.name || '—';
          $('#liveAlertClass').textContent = alertData.class || '—';
          $('#liveAlertBooth').textContent = alertData.booth || '—';
          $('#liveVoteAlert').classList.remove('hidden');
        } else {
          $('#liveVoteAlert').classList.add('hidden');
        }
      } catch (e) {}
    }

    $('#logoutBtn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      location.reload();
    });

    function startResultsPolling() {
      fetchResults();
      clearInterval(state.pollTimer);
      state.pollTimer = setInterval(fetchResults, POLL_MS);
    }

    async function fetchResults() {
      checkLiveAlerts();
      const { ok, data } = await api('/api/results');
      if (ok && data) renderResults(data);
    }

    function renderResults(d) {
      const counts = d.counts || {};
      const total = d.totalVoters || readSettings().totalVoters;
      const votesIn = d.votesIn || 0;
      if ($('#adminTotal')) $('#adminTotal').textContent = total;
      if ($('#adminCount')) $('#adminCount').textContent = votesIn;
      if ($('#adminPercent')) $('#adminPercent').textContent = (total ? (votesIn / total * 100) : 0).toFixed(1) + '%';
      const max = Math.max(1, ...[1, 2, 3, 4].map(i => counts[i] || 0));
      $$('#resultList .result-row').forEach((row, idx) => {
        const c = counts[idx + 1] || 0;
        const bar = row.querySelector('.result-track i');
        const num = row.querySelector('strong');
        if (bar) bar.style.width = Math.round(c / max * 100) + '%';
        if (num) num.textContent = c;
      });
      state.allActivityData = d.activity || [];
      renderActivity(state.allActivityData);
    }

    function activityRowHtml(a) {
      return '<tr><td><div class="person">' + maskName(a.name) + '</div></td><td>' + (a.class || '-') + '</td><td><span class="badge green">Sudah memilih</span></td><td>' + (a.time || '') + '</td><td>Bilik ' + (a.booth || '-') + '</td></tr>';
    }

    function renderActivity(list) {
      const tbodyEl = $('#activityTableBody');
      const tbodyEl2 = $('#participantTableBody');
      const html = list.length ? list.slice(0, 10).map(activityRowHtml).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">Belum ada data.</td></tr>';
      if (tbodyEl) tbodyEl.innerHTML = html;
      if (tbodyEl2) tbodyEl2.innerHTML = html;
    }

    function renderAllParticipantsModal() {
      const tbodyEl = $('#allParticipantsTableBody');
      const list = state.allActivityData;
      if (tbodyEl) {
        tbodyEl.innerHTML = list.length ? list.map(activityRowHtml).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">Belum ada data peserta.</td></tr>';
      }
    }

    applySettings();
    startResultsPolling();
  </script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const user = getSessionUser(req);

  if (!user) {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(loginPageHtml());
    return;
  }

  let activity = [];
  try {
    activity = await store.getActivity(1000);
  } catch (e) {
    // Kalau gagal mengambil data awal, tetap tampilkan dashboard kosong;
    // polling /api/results di client akan mencoba mengisi ulang.
    activity = [];
  }

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(dashboardHtml(activity));
};
