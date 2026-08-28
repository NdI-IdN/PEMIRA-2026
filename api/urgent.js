// GET /api/urgent -> Laporan visual tabel data voting utuh.
const { getSessionUser } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  if (!getSessionUser(req)) {
    res.status(401).send('<h2 style="font-family:sans-serif; color:red;">Tidak diizinkan. Harap login admin.</h2>');
    return;
  }

  let activity;
  try {
    activity = await store.getActivity(1000); 
  } catch (e) {
    res.status(500).send('Gagal membaca data dari KV.');
    return;
  }

  // Menyusun data menjadi baris tabel HTML
  const tableRows = activity.map((a, i) => `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #eee;">${i + 1}</td>
      <td style="padding:10px; border-bottom:1px solid #eee;"><strong>${a.name}</strong></td>
      <td style="padding:10px; border-bottom:1px solid #eee;">${a.class}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#128264; font-weight:bold;">${a.booth}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#71809e;">${a.time}</td>
    </tr>
  `).join('');

  // Membungkusnya dengan desain halaman web sederhana
  const htmlLayout = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="utf-8">
      <title>Data Rahasia Pemira</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #f6f8fc; padding: 30px; color: #17213e; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 25px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
        h1 { margin-top: 0; font-size: 24px; color: #101a37; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; text-align: left; }
        th { background: #f0f3fa; color: #71809e; padding: 12px 10px; font-weight: 700; text-transform: uppercase; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📑 Log Data Pemilih (Tanpa Sensor)</h1>
        <p style="color:#71809e; font-size:13px; margin-top:-10px;">Total suara terekam: <strong>${activity.length}</strong></p>
        
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Lengkap</th>
              <th>Kelas</th>
              <th>Status Bilik</th>
              <th>Waktu</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="5" style="padding:20px; text-align:center;">Belum ada suara masuk.</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;

  // Kirim hasilnya sebagai halaman web (HTML), bukan sekadar teks mentah
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(htmlLayout);
};
