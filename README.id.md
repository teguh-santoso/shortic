<p align="center">
  <img src="assets/logo.svg" alt="shortic" width="320" />
</p>

<p align="center">
  <strong>Pembuat tautan pendek statis tanpa backend server.</strong><br />
  <em>Redirect berbasis fragment (<code>contoh.com/#kode</code>), Supabase di belakang layar.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Cloudflare%20Pages-f38020?logo=cloudflare&logoColor=white" alt="Cloudflare Pages" />
  <img src="https://img.shields.io/badge/Database-Supabase-3fcf8e?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/License-MIT-3da9fc" alt="License: MIT" />
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.id.md">Bahasa Indonesia</a>
</p>

---

## Fitur

- **Tanpa backend server** — semuanya HTML/CSS/JS statis di Cloudflare Pages. Tidak ada server Node, tidak ada Worker.
- **Tautan pendek berbasis fragment** — `https://contoh.com/#abc123` dialihkan ke URL tujuan secara client-side.
- **Preview Open Graph generik** — berbagi tautan pendek apa pun di WhatsApp/Facebook/X menampilkan kartu bermerek shortic (`og:image` statis). Preview per-link tidak mungkin dengan URL berbasis fragment di hosting statis murni; lihat [Preview Open Graph](#preview-open-graph).
- **Login Google OAuth** dengan **allowlist** yang ditegakkan di level database lewat trigger Postgres — user yang emailnya tidak terdaftar otomatis dihapus dari `auth.users`.
- **Panel admin** (`admin.contoh.com`):
  - Buat / edit / hapus link dengan kode acak otomatis (atau kode kustom).
  - Pencarian dan pagination untuk daftar link yang banyak.
  - **QR code** per link dengan **salin** + **unduh PNG**.
  - Manajemen user (khusus admin): ubah role dan kelola allowlist email.
  - UI **flat responsif** dengan toggle **mode gelap**.
- **Row-level security** — user hanya mengelola link miliknya; admin mengelola semuanya.
- **Anti-enumerasi** — klien anonim hanya bisa lookup link lewat RPC `SECURITY DEFINER` yang dibatasi, tidak pernah akses tabel langsung.
- **Keep-alive cron** — workflow GitHub Actions mem-ping Supabase setiap hari agar project free-tier tidak ter-pause karena inaktivitas.

## Arsitektur

```
                        ┌─────────────────────────────┐
                        │        Cloudflare Pages      │
                        │                             │
   contoh.com/#kode ──▶ │  public-site/  (statis)     │
                        │  baca #kode, panggil RPC    │
                        └──────────────┬──────────────┘
                                       │  supabase-js (anon key)
                        ┌──────────────▼──────────────┐
                        │          Supabase            │
                        │  Postgres + Auth + RLS       │
                        │  - links / profiles          │
                        │  - allowed_emails (allowlist)│
                        └──────────────▲──────────────┘
                                       │  supabase-js (authenticated)
                        ┌──────────────┴──────────────┐
                        │  admin-panel/  (statis)      │
   admin.contoh.com ──▶ │  Login Google OAuth + CRUD   │
                        └─────────────────────────────┘

   .github/workflows/supabase-keepalive.yml
     ──▶ mem-ping Supabase setiap hari agar project free-tier tidak pause
```

**Model keamanan**

- **Kunci `anon` itu publik** — tertanam di JavaScript halaman publik dan aman untuk diekspos. Semua penegakan keamanan ada di **database** (policies RLS + trigger), bukan di kode frontend.
- Klien anonim **hanya bisa** memanggil `get_link_by_code()` (RPC `SECURITY DEFINER` yang mengembalikan maksimal satu baris untuk kode yang persis). `SELECT` langsung ke `links` dicabut dari role `anon`.
- Kunci `service_role` **tidak boleh** pernah di-commit ke repo atau ditanam di kode frontend.

## Tech Stack

- **Frontend:** vanilla HTML/CSS/JS (tanpa framework), [supabase-js v2](https://github.com/supabase/supabase-js), [Materialize CSS](https://materializecss.com/) (di-override menjadi flat), [qrcodejs](https://github.com/davidshimjs/qrcodejs) untuk QR.
- **Backend / data:** [Supabase](https://supabase.com) (Postgres + Auth + RLS).
- **Hosting:** Cloudflare Pages (dua project).
- **CI:** GitHub Actions (keep-alive harian).

## Struktur Project

```
shortic/
├── public-site/                 # → project CF Pages "shortener" (contoh.com)
│   ├── index.html               # halaman landing dengan logo SVG
│   ├── app.js                   # baca #kode, resolve via RPC, redirect
│   ├── config.js                # konfigurasi runtime (gitignored, dibuat saat build)
│   └── style.css
│
├── admin-panel/                 # → project CF Pages "shortener-admin" (admin.contoh.com)
│   ├── index.html               # halaman login (Google OAuth)
│   ├── dashboard.html           # CRUD link, user, allowlist, QR
│   ├── auth.js                  # guard session + sinkronisasi profile
│   ├── app.js                   # logika dashboard (search, pagination, QR, modal)
│   ├── theme.js                 # toggle mode gelap/terang (localStorage)
│   ├── config.js                # konfigurasi runtime (gitignored, dibuat saat build)
│   └── style.css
│
├── supabase/
│   ├── schema.sql               # tabel, RPC, trigger allowlist
│   ├── policies.sql             # policies RLS (idempotent)
│   ├── seed.sql                 # isi email admin pertamamu
│   └── reconcile.sql            # backfill satu kali untuk user lama
│
├── scripts/
│   └── generate-config.js       # menulis config.js dari env var saat build
│
├── assets/
│   └── logo.svg                 # logo shortic (dipakai di README ini)
│
└── .github/workflows/
    └── supabase-keepalive.yml   # ping harian agar project free-tier tidak pause
```

## Prasyarat

- Akun [Supabase](https://supabase.com) (tier gratis cukup).
- Akun [Cloudflare](https://cloudflare.com) dengan Pages.
- Akun [GitHub](https://github.com) (untuk repo + Actions).
- (Opsional tapi disarankan) domain sendiri, mis. `contoh.com` dengan `admin.contoh.com` untuk panel admin.
- Project di Google Cloud untuk OAuth.

## Setup

### 1. Buat project Supabase

1. Buat project di [database.new](https://database.new).
2. Buka **Settings → API** dan catat:
   - **Project URL** (mis. `https://REF-PROJECTMU.supabase.co`)
   - kunci **anon public**

### 2. Jalankan SQL

Buka **SQL Editor** di dashboard Supabase, lalu jalankan berurutan:

1. `supabase/schema.sql` — membuat tabel (`links`, `profiles`, `allowed_emails`), trigger allowlist di `auth.users`, dan RPC.
2. `supabase/policies.sql` — mengaktifkan Row Level Security dan membuat semua policies (idempotent, aman dijalankan ulang).
3. `supabase/seed.sql` — **edit dulu** dan ganti `admin@contoh.com` dengan emailmu, lalu jalankan. Ini membuat entri admin pertama di allowlist.

> Jika sudah ada user di `auth.users` sebelum trigger terpasang, jalankan juga `supabase/reconcile.sql` sekali. Skrip ini membuat profile untuk user yang sudah di-allowlist dan menghapus user yang tidak.

### 3. Setup Google OAuth

**Google Cloud Console**

1. Buka [console.cloud.google.com](https://console.cloud.google.com) dan buat/pilih project.
2. **APIs & Services → OAuth consent screen** → pilih *External*, isi nama aplikasi dan email, lalu **Publish app**.
   - Selama status masih *Testing*, hanya email yang kamu tambahkan sebagai test user yang bisa login.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → tipe **Web application**.
4. Tambahkan **Authorized redirect URI**:
   ```
   https://REF-PROJECTMU.supabase.co/auth/v1/callback
   ```
5. Tambahkan **Authorized JavaScript origins**:
   - `https://admin.contoh.com`
   - `http://localhost` dan `http://localhost:PORT` (hanya jika develop lokal)
6. Salin **Client ID** dan **Client Secret**.

**Supabase Dashboard**

1. **Authentication → Providers** → aktifkan **Google**.
2. Tempel Client ID dan Client Secret, lalu **Save**.

### 4. Buat file `config.js` lokal

`config.js` **sengaja di-gitignore**. Untuk development lokal, salin nilai dari `.env.example` ke `public-site/config.js` dan `admin-panel/config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://REF-PROJECTMU.supabase.co",
  SUPABASE_ANON_KEY: "KUNCI-ANON-MU",
  PUBLIC_BASE_URL: "https://contoh.com", // hanya admin-panel
};
```

> `PUBLIC_BASE_URL` dipakai panel admin untuk menampilkan teks tautan pendek di dashboard. Tidak diperlukan di `public-site/config.js`.

### 5. Development lokal

Serve tiap folder dengan server statis apa pun, misalnya:

```bash
npx serve public-site
npx serve admin-panel
```

Pastikan origin lokal (mis. `http://localhost:3000`) didaftarkan di:
- Google Cloud Console → **Authorized JavaScript origins**
- Supabase → **Authentication → URL Configuration → Redirect URLs** (mis. `http://localhost:3000/dashboard.html`)

## Deploy ke Cloudflare Pages

`config.js` **tidak** disimpan di repository. Saat build, file dibuat dari environment variables oleh `scripts/generate-config.js`.

Buat **dua project Pages terpisah** dari repository ini.

### Project 1 — `shortener` (public site → `contoh.com`)

| Pengaturan             | Nilai                                                                  |
|------------------------|------------------------------------------------------------------------|
| Root directory         | *(kosongkan — repo root)*                                              |
| Build command          | `node scripts/generate-config.js public-site && node scripts/inject-og.js public-site` |
| Build output directory | `public-site`                                                          |

### Project 2 — `shortener-admin` (admin → `admin.contoh.com`)

| Pengaturan             | Nilai                                           |
|------------------------|-------------------------------------------------|
| Root directory         | *(kosongkan — repo root)*                       |
| Build command          | `node scripts/generate-config.js admin-panel`   |
| Build output directory | `admin-panel`                                   |

> **Penting:** jangan set Root directory ke subfolder — build command selalu berjalan dari repo root. Jika sudah terlanjur di-set, kosongkan; atau pakai `node ../scripts/generate-config.js .` dengan output directory `.`.

### Environment variables

Set di **Settings → Environment variables** tiap project:

| Variable            | public-site | admin-panel | Keterangan                                  |
|---------------------|:-----------:|:-----------:|---------------------------------------------|
| `SUPABASE_URL`      | ✅          | ✅          | Project URL Supabase                        |
| `SUPABASE_ANON_KEY` | ✅          | ✅          | Kunci anon public Supabase                  |
| `PUBLIC_BASE_URL`   | —           | ✅          | Base URL publik untuk tautan pendek, mis. `https://contoh.com` |
| `SITE_URL`          | ✅          | —           | URL situs publik (opsional) — di-inject ke tag meta Open Graph sebagai URL absolut |

> Saat deploy via **Direct Upload**, upload folder lokal langsung — `config.js` ikut karena ada di lokal. Pastikan sudah terisi sebelum upload.

### Custom domain

1. Buka project → **Custom domains** → tambah `contoh.com` (public site) dan `admin.contoh.com` (admin).
2. Ikuti langkah verifikasi DNS.
3. Tambahkan `https://admin.contoh.com` ke **Authorized JavaScript origins** di Google Cloud Console.

## GitHub Actions — Supabase Keep-Alive

Workflow di `.github/workflows/supabase-keepalive.yml` mem-ping Supabase sekali sehari agar project free-tier tidak ter-pause setelah 7 hari inaktivitas.

Set dua repository secrets (**Settings → Secrets and variables → Actions**):

| Secret               | Nilai                                       |
|----------------------|---------------------------------------------|
| `SUPABASE_URL`       | `https://REF-PROJECTMU.supabase.co`         |
| `SUPABASE_ANON_KEY`  | kunci anon public kamu                      |

> Workflow memanggil RPC `get_link_by_code` dengan kode dummy, bukan query tabel `links` langsung. Akses anonim langsung ke tabel `links` sengaja dicabut demi keamanan (anti-enumerasi), jadi query tabel langsung akan gagal — dan jika berhasil justru merusak model keamanan.

Jalankan sekali secara manual dari tab **Actions** untuk verifikasi (log harus menampilkan `Supabase pinged successfully.`).

## Referensi Environment Variables

| Variable             | Tempat                         | Wajib  | Fungsi                                  |
|----------------------|--------------------------------|:------:|-----------------------------------------|
| `SUPABASE_URL`       | Env CF Pages (kedua project), `config.js` lokal | ✅ | Project URL Supabase |
| `SUPABASE_ANON_KEY`  | Env CF Pages (kedua project), `config.js` lokal, GitHub secret | ✅ | Kunci anon public Supabase |
| `PUBLIC_BASE_URL`    | Env CF Pages (admin saja), `config.js` lokal (admin saja) | ⚠️ | Base URL tautan pendek untuk dashboard admin |

## Catatan Keamanan

- **Kunci `anon` publik secara desain.** Ia berada di frontend dan aman diekspos; perlindungan datang dari RLS, bukan dari menyembunyikan kunci.
- **Akses tabel langsung dicabut dari `anon`** (`revoke all on table public.links from anon`). Satu-satunya pintu masuk anon adalah `get_link_by_code()`, RPC `SECURITY DEFINER` yang mengembalikan tepat satu baris untuk `code` yang persis — mencegah enumerasi massal semua tautan pendek.
- **Allowlist ditegakkan di database**, bukan di UI. Trigger di `auth.users` menghapus akun yang emailnya tidak ada di `allowed_emails`, sehingga user yang ditolak tidak bisa memakai session walau melewati frontend.
- **Policies RLS** menjamin user hanya bisa `SELECT/UPDATE/DELETE` link miliknya (`owner_id = auth.uid()`), kecuali admin.
- **Jangan pernah commit kunci `service_role`** ke repository atau menanamnya di kode frontend. Kunci itu hanya untuk tooling server/admin yang terpercaya.

## Pemecahan Masalah

| Gejala                                                             | Kemungkinan penyebab / solusi                                                                                    |
|--------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `Refused to execute script from '.../config.js'` (MIME text/html)  | `config.js` tidak ter-generate saat build Pages. Set build command + env vars (lihat bagian Deploy).              |
| `infinite recursion detected in policy for relation "profiles"`    | Kamu memakai `policies.sql` lama. Jalankan ulang `schema.sql` (menambah `is_admin()`) lalu `policies.sql` terbaru. |
| Setelah login Google redirect ke `localhost:3000`                  | **Site URL** / **Redirect URLs** Supabase masih lokal. Ubah ke domain aslimu.                                    |
| Keep-alive gagal dengan HTTP 401                                   | `SUPABASE_ANON_KEY` di GitHub Secrets stale/salah. Salin ulang anon key dari Supabase → Settings → API.            |
| `Identifier 'supabase' has already been declared`                  | Cache script lama. Hard refresh (Ctrl+Shift+R) — kode sekarang menamai client `sb` untuk menghindari global CDN.    |
| Tautan pendek menampilkan logo tapi tidak redirect                 | Cek console browser. Biasanya `config.js` tidak ada/salah atau RPC belum ada di project Supabase.                 |

## Preview Open Graph

Halaman landing publik menyertakan meta Open Graph / Twitter statis (`og:title`, `og:description`, `og:image`, `twitter:card`) sehingga berbagi tautan pendek seperti `https://contoh.com/#abc123` menampilkan **kartu bermerek shortic** (`assets/og-preview.png`) di WhatsApp, Facebook, X, Telegram, dll.

**Kenapa preview-nya generik (bukan per-link):**

- Fragment (`#code`) tidak pernah dikirim ke server, dan crawler sosial tidak menjalankan JavaScript, jadi host statis murni tidak bisa tahu link mana yang diminta.
- Platform sosial tidak mendukung SVG sebagai `og:image`, jadi kartu bermerek dibuat sebagai PNG pra-render (1200×630).

Jika ingin preview per-link, salah satu kendala harus direlakskan (mis. URL berbasis path `/kode`, atau satu Pages Function kecil). Project ini sengaja mempertahankan format fragment di hosting statis murni.

Supaya `og:image` / `og:url` absolut (diwajibkan sebagian scraper), set environment variable `SITE_URL` di project public-site (mis. `https://contoh.com`); `scripts/inject-og.js` mengganti placeholder `__SITE_URL__` saat build. Jika tidak di-set, URL relatif dipakai sebagai fallback.

## Batasan & Roadmap

- Redirect terjadi client-side, jadi search engine / bot yang tidak menjalankan JavaScript tidak akan mengikuti redirect.
- Limit tier gratis Supabase berlaku (DB 500 MB, project pause setelah 7 hari inaktivitas — dimitigasi oleh cron keep-alive).
- Ide pengembangan: dashboard analitik klik, edit slug kustom, tema kustom, dukungan PWA.

## Lisensi

[MIT](LICENSE) © 2026 Teguh Santoso