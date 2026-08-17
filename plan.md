# Plan: URL Shortener (Fragment-based) + Admin Panel Terpisah

## Ringkasan Arsitektur

Dua project Cloudflare Pages terpisah, satu database Supabase:

1. **`contoh.com`** — halaman publik statis. Baca `#short` dari fragment URL, lookup ke Supabase, redirect client-side.
2. **`admin.contoh.com`** — dashboard manajemen link & user, project Pages terpisah, protected oleh Supabase Auth.
3. **Supabase** — Postgres + Auth + RLS sebagai satu-satunya sumber data, diakses langsung dari kedua frontend via `@supabase/supabase-js`.
4. **GitHub Actions cron** — heartbeat harian supaya project Supabase tidak di-pause karena inactivity (limit 7 hari).

Tidak ada backend custom (Worker/Node server) — murni static hosting + Supabase client SDK. Semua enforcement keamanan ada di RLS policies, bukan di kode frontend.

---

## Struktur Repo

Disarankan **monorepo** dengan dua folder root, tiap folder jadi satu CF Pages project:

```
url-shortener/
├── public-site/              # → deploy sebagai project "shortener" (contoh.com)
│   ├── index.html
│   ├── app.js                # baca hash, fetch Supabase, redirect
│   └── style.css
│
├── admin-panel/               # → deploy sebagai project "shortener-admin" (admin.contoh.com)
│   ├── index.html             # login page
│   ├── dashboard.html         # CRUD links + users
│   ├── app.js
│   ├── auth.js
│   └── style.css
│
├── supabase/
│   ├── schema.sql             # definisi tabel
│   ├── policies.sql           # RLS policies
│   └── seed.sql                # (opsional) data contoh
│
├── .github/
│   └── workflows/
│       └── supabase-keepalive.yml
│
└── plan.md                    # file ini
```

---

## 1. Skema Database Supabase

### Tabel `links`
| Kolom        | Tipe        | Keterangan                                  |
|--------------|-------------|----------------------------------------------|
| `id`         | uuid, PK    | default `gen_random_uuid()`                  |
| `code`       | text, unique| short code acak (bukan sekuensial)           |
| `target_url` | text        | URL tujuan                                    |
| `owner_id`   | uuid        | FK ke `auth.users.id`                        |
| `created_at` | timestamptz | default `now()`                              |
| `click_count`| integer     | default `0` (opsional, untuk statistik)      |

### Tabel `profiles`
| Kolom      | Tipe     | Keterangan                       |
|------------|----------|------------------------------------|
| `id`       | uuid, PK | FK ke `auth.users.id`             |
| `role`     | text     | `'admin'` \| `'user'`, default `'user'` |
| `email`    | text     | disalin dari `auth.users.email` saat signup, untuk kemudahan query |

Multiuser: setiap user yang lolos allowlist otomatis dapat baris `profiles` (role default `'user'`), lalu admin bisa naikkan jadi `'admin'` lewat dashboard. Semua user hanya kelola link miliknya sendiri (`owner_id`) kecuali role `'admin'`.

### Tabel `allowed_emails` (allowlist untuk Google OAuth)
| Kolom        | Tipe        | Keterangan                          |
|--------------|-------------|----------------------------------------|
| `email`      | text, PK    | email yang diizinkan login             |
| `role`       | text        | role yang diberikan otomatis saat signup, default `'user'` |
| `added_at`   | timestamptz | default `now()`                        |

Hanya admin yang boleh `INSERT/DELETE` ke tabel ini (lewat dashboard atau SQL editor langsung). Tabel ini yang jadi gerbang: kalau email tidak ada di sini, signup Google ditolak otomatis (lihat bagian Auth di bawah).

### RLS Policies
- `links`:
  - `SELECT` — publik boleh baca **satu baris via exact match `code`** (dipakai halaman shortlink). Jangan buat policy yang izinkan `SELECT *` tanpa filter dari sisi client anonim yang bisa dieksploitasi untuk dump masal (tetap technically bisa query semua kalau tidak dibatasi — pertimbangkan kolom yang di-expose lewat view terbatas, lihat catatan keamanan di bawah).
  - `INSERT/UPDATE/DELETE` — hanya `auth.uid() = owner_id` (user hanya kelola link miliknya), atau `role = 'admin'` untuk akses penuh.
- `profiles`:
  - `SELECT` — user hanya baca profil sendiri, admin baca semua.
  - `UPDATE role` — hanya admin.

**Catatan keamanan penting (enumerasi massal):**
Supabase REST API secara default mengizinkan query `SELECT` dengan filter apapun kalau RLS mengizinkan `SELECT`. Untuk mencegah dump semua link:
- Buat RLS policy `SELECT` yang **mewajibkan** filter `code = ...` secara eksplisit tidak bisa ditegakkan murni lewat RLS (RLS tidak tahu apakah client filter atau tidak).
- Solusi paling aman: buat **Postgres function/RPC** `get_link_by_code(code text)` yang `SECURITY DEFINER`, return cuma 1 baris, dan **cabut** hak `SELECT` langsung ke tabel `links` dari role `anon`. Halaman publik panggil RPC ini, bukan query tabel langsung. Ini mencegah enumerasi/list total secara struktural.
- Pakai `code` acak (6+ karakter alfanumerik) supaya brute-force per kode tidak praktis.

---

## 1b. Google OAuth + Allowlist Enforcement

### Setup di Supabase Dashboard
1. Aktifkan provider **Google** di `Authentication > Providers`.
2. Buat OAuth Client ID di Google Cloud Console (tipe "Web application"), isi:
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Masukkan `Client ID` dan `Client Secret` dari Google ke setting provider Supabase.
4. Di `admin-panel`, tambahkan Authorized JavaScript origin `https://admin.contoh.com` di Google Cloud Console juga.

### Kenapa allowlist tidak bisa cuma dari sisi frontend
Kalau pengecekan email whitelist cuma dilakukan di JS (misal "kalau email tidak cocok, jangan tampilkan dashboard"), user tetap **berhasil login** di level Supabase Auth dan bisa panggil API langsung lewat console browser. Maka enforcement harus di level database via trigger, bukan hanya UI.

### Mekanisme enforcement (Postgres trigger)
Buat trigger pada `auth.users` yang jalan **setelah insert** (yaitu setiap kali ada signup baru via Google):
1. Cek apakah `NEW.email` ada di tabel `allowed_emails`.
2. **Kalau ada** → insert baris ke `profiles` dengan `role` sesuai yang tercatat di `allowed_emails`.
3. **Kalau tidak ada** → hapus user tersebut dari `auth.users` (`DELETE FROM auth.users WHERE id = NEW.id`) sehingga account langsung tidak valid, dan session yang baru dibuat otomatis invalid saat request berikutnya.

Di sisi frontend, tetap tambahkan pengecekan setelah redirect balik dari Google: kalau `supabase.auth.getSession()` sukses tapi tidak ada baris `profiles` yang cocok (karena baru saja dihapus oleh trigger), tampilkan pesan "email tidak terdaftar" dan panggil `supabase.auth.signOut()`.

Ini membuat allowlist ditegakkan di lapisan yang tidak bisa dilewati dari client, sekaligus UX tetap jelas untuk user yang ditolak.

---

## 2. Halaman Publik (`public-site/`)

- `index.html` load `app.js` yang:
  1. Ambil `window.location.hash` (buang karakter `#`).
  2. Kalau kosong → tampilkan halaman landing biasa.
  3. Kalau ada → panggil RPC `get_link_by_code(code)` via Supabase JS client (pakai `anon key`, aman untuk expose di frontend).
  4. Kalau ketemu → `window.location.replace(target_url)`.
  5. Kalau tidak ketemu → tampilkan pesan "link tidak ditemukan".

---

## 3. Admin Panel (`admin-panel/`)

- `index.html` — tombol "Login dengan Google" (`supabase.auth.signInWithOAuth({ provider: 'google' })`), tanpa form email/password.
- `dashboard.html` (protected):
  - Redirect ke `index.html` kalau tidak ada session aktif (`supabase.auth.getSession()`).
  - Setelah dapat session, query `profiles` untuk email tersebut — kalau tidak ketemu (ditolak allowlist), tampilkan pesan error + `signOut()`, jangan render dashboard.
  - Tabel daftar link milik user (kalau role `'user'`) atau semua link semua user (kalau role `'admin'`) — CRUD: tambah, edit, hapus.
  - Generator short code acak otomatis saat tambah link baru (client-side random string generator, cek uniqueness lewat insert-catch-retry).
  - Panel manajemen user (khusus role `'admin'`):
    - List semua `profiles` beserta email dan role.
    - Form tambah/hapus entry `allowed_emails` (mengatur siapa yang boleh login berikutnya).
    - Tombol ubah role user existing antara `'user'` dan `'admin'`.
- Deploy sebagai project Pages terpisah → domain `admin.contoh.com`.

---

## 4. GitHub Actions — Supabase Keep-Alive

`.github/workflows/supabase-keepalive.yml`:
- Jadwal: `cron: '0 0 * * *'` (harian, sebelum 7 hari batas inactivity).
- Step: `curl` sederhana ke Supabase REST endpoint (misal `SELECT count(*) FROM links` pakai `anon key`) supaya tercatat sebagai aktivitas.
- Simpan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sebagai GitHub Secrets.

---

## 5. Environment Variables

Baik `public-site` maupun `admin-panel` butuh (di-inject saat build atau hardcode karena `anon key` memang aman untuk client-side):
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
```
`service_role key` **tidak boleh** pernah ada di kode frontend/repo — hanya dipakai kalau ada script admin lokal terpisah.

---

## 6. Urutan Kerja untuk opencode

1. Inisialisasi struktur repo sesuai di atas.
2. Tulis `supabase/schema.sql` (tabel `links`, `profiles`, `allowed_emails`, RPC `get_link_by_code`, trigger allowlist di `auth.users`) + `supabase/policies.sql` (RLS untuk semua tabel).
3. Isi minimal satu baris di `allowed_emails` (email kamu sendiri, role `'admin'`) lewat SQL editor Supabase — supaya ada admin pertama sebelum dashboard bisa dipakai untuk kelola user lain.
4. Setup Google OAuth provider di Supabase Dashboard + Google Cloud Console (lihat bagian 1b).
5. Bangun `public-site/` (index + app.js lookup via RPC).
6. Bangun `admin-panel/` (login Google + dashboard CRUD link + panel manajemen user, khusus admin).
7. Tulis GitHub Actions workflow keep-alive.
8. Deploy `public-site` → CF Pages project `shortener`, domain `contoh.com`.
9. Deploy `admin-panel` → CF Pages project `shortener-admin`, domain `admin.contoh.com`. Tambahkan domain ini ke Authorized JavaScript origins di Google Cloud Console.
10. Test end-to-end:
    - Login dengan email yang ada di `allowed_emails` → berhasil masuk dashboard.
    - Login dengan email yang **tidak** ada di allowlist → ditolak, session di-invalidate.
    - Buat link lewat admin panel → akses `contoh.com/#code` → pastikan redirect benar dan tabel `links`/`allowed_emails` tidak bisa di-dump oleh anon client.

---

## Catatan Skala & Batasan

- **CF Pages**: static requests unlimited, tidak kena limit 100K/hari milik Workers.
- **Supabase Free**: 500MB DB, pause setelah 7 hari inactivity (di-mitigasi cron), 2 project aktif max.
- **Enumerasi**: dicegah via RPC-only access ke `links`, bukan direct table SELECT.
