# PEMIRA — Pemilihan Ketua OSIS

Frontend statis (`index.html`) + backend serverless (folder `api/`) di Vercel.
Login admin dan penghitungan suara diproses di server; data suara disimpan di
Redis (Upstash / Vercel KV).

## Fitur

- **Login admin** — kredensial di server (env var), cookie sesi HttpOnly bertanda-tangan HMAC. Bukan cek password di JS.
- **Voting** — tiap suara direkam ke Redis (`HINCRBY`, atomic, anti tabrakan).
- **Dashboard live** — hasil voting auto-refresh **tiap 30 detik**.
- **Reset data** — endpoint admin untuk hapus data uji sebelum pemilihan asli.

## Endpoint API

| Method | Path           | Akses  | Fungsi                                 |
|--------|----------------|--------|----------------------------------------|
| POST   | `/api/login`   | publik | Login admin, set cookie sesi           |
| GET    | `/api/me`      | publik | Cek status sesi                        |
| POST   | `/api/logout`  | publik | Hapus cookie sesi                      |
| POST   | `/api/vote`    | publik | Rekam 1 suara                          |
| GET    | `/api/results` | admin  | Hasil voting + aktivitas terbaru       |
| POST   | `/api/reset`   | admin  | Hapus semua suara (data uji)           |

## Cara deploy ke Vercel

1. **Push folder ini ke GitHub** (atau `vercel` CLI langsung).
2. Di **vercel.com** → *Add New Project* → import repo ini. Framework: *Other*. Deploy.
3. **Tambah database KV**: dashboard project → tab **Storage** → *Create Database* →
   **Upstash Redis** (atau KV) → connect ke project.
   Ini otomatis mengisi env `KV_REST_API_URL` dan `KV_REST_API_TOKEN`.
4. **Set Environment Variables** (Settings → Environment Variables):
   - `ADMIN_USERNAME` = `admin`
   - `ADMIN_PASSWORD` = `adminkeren123`
   - `SESSION_SECRET` = string acak panjang
     (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `TOTAL_VOTERS` = `240` (opsional)
5. **Redeploy** supaya env var kepakai.

Selesai. Buka URL project → tombol **Masuk Admin**.

## Multi-bilik

Tiap komputer bilik buka URL dengan parameter `?booth=N`, misal:
`https://namaproject.vercel.app/?booth=2`. Nomor bilik ikut tercatat di aktivitas.

## Ganti kredensial admin

Ubah env `ADMIN_USERNAME` / `ADMIN_PASSWORD` di dashboard Vercel, lalu redeploy.
Jangan taruh password di dalam kode.

## Tes lokal

```bash
npm i -g vercel
vercel dev
```

Copy `.env.example` → `.env.local`, isi nilainya. Untuk KV lokal, pakai kredensial
Upstash (URL + token) langsung. Buka `http://localhost:3000`.

## Catatan keamanan

Ini kelas "kontrol akses untuk demo/acara sekolah", bukan sistem pemilu tahan-audit.
Tidak ada verifikasi identitas pemilih / cegah nyoblos ganda (kiosk diawasi panitia).
Kalau butuh itu, perlu login pemilih + daftar pemilih (DPT) di server.
